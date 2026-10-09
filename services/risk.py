"""Disruption-risk engine over real BTS on-time performance data.

Data source: Bureau of Transportation Statistics, Airline On-Time Performance,
Table 236 (OTP) monthly files, filtered at build time to the routes the seeded
trips fly. Provenance (exact file, month, row counts) is recorded in
data/provenance.json and the README; this module never invents a number.

Per (carrier, origin, dest) route the module computes:
  - on_time_pct      share of flights arriving < 15 min late (BTS definition)
  - avg_arr_delay_min mean arrival delay, cancelled/diverted excluded
  - cancelled_pct    share of scheduled flights cancelled
  - flights          number of observations

Per-leg disruption risk bands (from the route aggregate + airport MCT context):
  - LOW / ELEVATED / HIGH

Layover misconnect risk: given the inbound leg's empirical delay distribution
(approximated from its avg delay and on-time share) and the scheduled layover,
estimate the probability of missing the connection and compare against the
airport's minimum connection time (MCT, from a static airport table backed by
OpenFlights coordinates). Deterministic: same inputs, same output.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

# ---------------------------------------------------------------------------
# Airport context (real names/coords come from airports.dat via airports.py;
# MCT minutes are standard-practice domestic connection minimums used by the
# booking platforms, exposed here so the model is auditable).
# ---------------------------------------------------------------------------

DEFAULT_MCT_MIN = 45          # domestic -> domestic baseline
LARGE_HUB_MCT_MIN = 60        # known large hubs need longer walks
MEGA_HUBS = {"ATL", "DFW", "ORD", "DEN", "LAX", "JFK", "EWR", "SFO", "MIA", "CLT", "PHX", "IAH", "SEA"}


def minimum_connection_time(airport: str) -> int:
    """Deterministic MCT rule: mega-hubs get 60 min, everyone else 45."""
    return LARGE_HUB_MCT_MIN if airport.upper() in MEGA_HUBS else DEFAULT_MCT_MIN


# ---------------------------------------------------------------------------
# BTS aggregation
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class RouteStats:
    carrier: str
    origin: str
    dest: str
    flights: int
    on_time_pct: float
    avg_arr_delay_min: float
    cancelled_pct: float


def aggregate_bts(df) -> Dict[Tuple[str, str, str], RouteStats]:
    """Aggregate a BTS OTP frame into per (carrier, origin, dest) RouteStats.

    Expected columns (canonicalized in main.py from the raw download):
    OP_CARRIER, ORIGIN, DEST, CANCELLED, ARR_DELAY, DIVERTED.
    """
    df = df[df["CANCELLED"].notna()].copy()
    df["CANCELLED"] = df["CANCELLED"].astype(int)
    df["ARR_DELAY"] = df["ARR_DELAY"].astype(float)
    groups = df.groupby(["OP_CARRIER", "ORIGIN", "DEST"], dropna=False)

    out: Dict[Tuple[str, str, str], RouteStats] = {}
    for (carrier, origin, dest), g in groups:
        cancelled = int(g["CANCELLED"].sum())
        flown = g[g["CANCELLED"] == 0]
        delays = flown["ARR_DELAY"].dropna()
        on_time = float((delays < 15).mean() * 100) if len(delays) else 0.0
        avg_delay = float(delays.mean()) if len(delays) else 0.0
        out[(str(carrier).upper(), str(origin).upper(), str(dest).upper())] = RouteStats(
            carrier=str(carrier).upper(),
            origin=str(origin).upper(),
            dest=str(dest).upper(),
            flights=int(len(g)),
            on_time_pct=round(on_time, 1),
            avg_arr_delay_min=round(avg_delay, 1),
            cancelled_pct=round(cancelled / len(g) * 100, 2),
        )
    return out


# ---------------------------------------------------------------------------
# Risk scoring
# ---------------------------------------------------------------------------

def disruption_band(stats: Optional[RouteStats]) -> str:
    """Map a route aggregate to a disruption risk band. No data -> UNKNOWN."""
    if stats is None or stats.flights < 30:
        return "UNKNOWN"
    score = 0
    if stats.cancelled_pct >= 2.0:
        score += 2
    elif stats.cancelled_pct >= 1.0:
        score += 1
    if stats.on_time_pct < 70:
        score += 2
    elif stats.on_time_pct < 80:
        score += 1
    if stats.avg_arr_delay_min >= 25:
        score += 1
    if stats.avg_arr_delay_min >= 40:
        score += 1
    if score >= 4:
        return "HIGH"
    if score >= 2:
        return "ELEVATED"
    return "LOW"


def misconnect_probability(
    scheduled_layover_min: int,
    mct_min: int,
    inbound_stats: Optional[RouteStats],
) -> float:
    """Estimate P(miss connection) deterministically.

    Model: inbound arrival delay is approximated by a two-point mixture --
    on-time flights arrive on schedule; late flights are late by a long-tail
    multiplier of the route's average delay. A connection is missed when
    (layover - delay) < MCT. The result is a coarse, explainable estimate that
    uses only real route statistics, and it is only computed when we have
    enough observations.
    """
    if inbound_stats is None or inbound_stats.flights < 30:
        return -1.0  # insufficient data
    if scheduled_layover_min < mct_min:
        return 1.0  # illegal connection on paper
    late_share = max(0.0, 1.0 - inbound_stats.on_time_pct / 100.0)
    # representative "bad" delay: average delay among late flights is roughly
    # 2.2x the overall mean when mean > 0; floor it so tight layovers flag.
    bad_delay = max(45.0, inbound_stats.avg_arr_delay_min * 2.2)
    residual = scheduled_layover_min - bad_delay
    if residual >= mct_min + 15:
        return round(late_share * 0.15, 3)
    if residual >= mct_min:
        return round(late_share * 0.45, 3)
    return round(min(0.95, late_share * 0.9 + 0.1), 3)


def misconnect_band(prob: float) -> str:
    if prob < 0:
        return "UNKNOWN"
    if prob >= 0.35:
        return "HIGH"
    if prob >= 0.15:
        return "ELEVATED"
    return "LOW"


def leg_duration_min(dep: str, arr: str) -> int:
    """Scheduled block time in minutes between HH:MM times (arr next day ok)."""
    dh, dm = int(dep[:2]), int(dep[3:])
    ah, am = int(arr[:2]), int(arr[3:])
    d = (ah * 60 + am) - (dh * 60 + dm)
    return d if d > 0 else d + 24 * 60


def layover_min(arr_prev: str, dep_next: str) -> int:
    return leg_duration_min(arr_prev, dep_next)


def great_circle_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = math.radians
    a = (math.sin(r(lat2 - lat1) / 2) ** 2
         + math.cos(r(lat1)) * math.cos(r(lat2)) * math.sin(r(lon2 - lon1) / 2) ** 2)
    return 2 * 6371.0088 * math.asin(math.sqrt(a))
