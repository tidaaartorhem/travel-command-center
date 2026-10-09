"""Deterministic morning-of briefing generator.

Given a Trip (with risk scoring already computed by risk.py) and the calendar
date the briefing is for, produce a plain-language briefing: headline trip
risk, per-leg alerts ordered by severity, the suggested airport arrival time
("leave by"), check-in state, and connection watch items.

Deterministic: no LLM, no randomness, no network. Same trip + same date gives
the same brief. Designed to be read on the morning of the first leg.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import Any, Dict, List

from .ingest import Trip
from .risk import (
    RouteStats, disruption_band, layover_min, minimum_connection_time,
    misconnect_band, misconnect_probability,
)


@dataclass
class BriefLeg:
    flight: str
    carrier: str
    route: str
    date: str
    dep: str
    arr: str
    band: str
    stats: Dict[str, Any] = field(default_factory=dict)


@dataclass
class BriefAlert:
    severity: str   # HIGH > ELEVATED > LOW
    text: str


SEVERITY_ORDER = {"HIGH": 0, "ELEVATED": 1, "LOW": 2, "UNKNOWN": 3}


def _stats_to_dict(s: RouteStats) -> Dict[str, Any]:
    return {
        "flights": s.flights,
        "on_time_pct": s.on_time_pct,
        "avg_arr_delay_min": s.avg_arr_delay_min,
        "cancelled_pct": s.cancelled_pct,
    }


def score_trip(
    trip: Trip,
    routes: Dict[tuple, RouteStats],
    airports: Dict[str, Any],
) -> Dict[str, Any]:
    """Score every leg and every connection. Returns JSON-ready structures."""
    legs: List[Dict[str, Any]] = []
    for leg in trip.legs:
        stats = routes.get((leg.carrier, leg.origin, leg.dest))
        band = disruption_band(stats)
        legs.append({
            "flight": leg.flight,
            "carrier": leg.carrier,
            "origin": leg.origin,
            "dest": leg.dest,
            "route": f"{leg.origin}-{leg.dest}",
            "date": leg.date,
            "dep": leg.dep,
            "arr": leg.arr,
            "confirmation": leg.confirmation,
            "band": band,
            "stats": _stats_to_dict(stats) if stats else None,
        })

    connections: List[Dict[str, Any]] = []
    for i in range(len(trip.legs) - 1):
        prev, nxt = trip.legs[i], trip.legs[i + 1]
        ap = prev.dest
        minutes = layover_min(prev.arr, nxt.dep)
        mct = minimum_connection_time(ap)
        inbound_stats = routes.get((prev.carrier, prev.origin, prev.dest))
        prob = misconnect_probability(minutes, mct, inbound_stats)
        band = misconnect_band(prob)
        connections.append({
            "airport": ap,
            "from_flight": prev.flight,
            "to_flight": nxt.flight,
            "layover_min": minutes,
            "mct_min": mct,
            "misconnect_prob": prob if prob >= 0 else None,
            "band": band,
            "tight": minutes < mct,
            "short": minutes < mct + 15,
        })

    alerts: List[BriefAlert] = []
    for leg in legs:
        if leg["band"] in ("HIGH", "ELEVATED"):
            s = leg["stats"]
            alerts.append(BriefAlert(
                leg["band"],
                f"{leg['flight']} {leg['route']}: disruption risk {leg['band']} — "
                f"route on-time {s['on_time_pct']}%, avg delay {s['avg_arr_delay_min']} min, "
                f"cancelled {s['cancelled_pct']}%.",
            ))
        elif leg["band"] == "UNKNOWN":
            alerts.append(BriefAlert(
                "LOW",
                f"{leg['flight']} {leg['route']}: no recent BTS observations for this "
                f"route/carrier — risk not scored.",
            ))
    for c in connections:
        if c["tight"]:
            alerts.append(BriefAlert(
                "HIGH",
                f"{c['airport']}: {c['layover_min']} min layover {c['from_flight']} → "
                f"{c['to_flight']} is under the {c['mct_min']} min minimum connection time — "
                f"rebook if possible.",
            ))
        elif c["band"] in ("HIGH", "ELEVATED"):
            pct = int(round(c["misconnect_prob"] * 100))
            alerts.append(BriefAlert(
                c["band"],
                f"{c['airport']}: {c['layover_min']} min layover {c['from_flight']} → "
                f"{c['to_flight']} — estimated misconnect probability {pct}%.",
            ))
    alerts.sort(key=lambda a: SEVERITY_ORDER[a.severity])
    return {
        "trip_id": trip.trip_id,
        "name": trip.name,
        "legs": legs,
        "connections": connections,
        "alerts": [{"severity": a.severity, "text": a.text} for a in alerts],
        "trip_band": min(
            [l["band"] for l in legs] + [c["band"] for c in connections],
            key=lambda b: SEVERITY_ORDER[b],
        ),
    }


def morning_brief(scored: Dict[str, Any], today: str) -> Dict[str, Any]:
    """Build the morning-of brief text blocks for a scored trip."""
    first = scored["legs"][0]
    first_date = date.fromisoformat(first["date"])
    today_d = date.fromisoformat(today)
    days_out = (first_date - today_d).days

    if days_out > 1:
        checkin = f"First leg departs in {days_out} days — set a check-in reminder."
        leave = "Airport timing will be computed the morning of travel."
    elif days_out == 1:
        checkin = "Check-in opens today for the first leg — confirm seats and bags."
        dep_dt = datetime.strptime(f"{first['date']} {first['dep']}", "%Y-%m-%d %H:%M")
        leave = (
            f"Plan to be at {first['origin']} by "
            f"{(dep_dt - timedelta(hours=2)).strftime('%-I:%M %p')} "
            f"(2 hours before the {first['dep']} departure)."
        )
    elif days_out == 0:
        checkin = "Today is travel day — checked in already? Bags packed?"
        dep_dt = datetime.strptime(f"{first['date']} {first['dep']}", "%Y-%m-%d %H:%M")
        leave = (
            f"Be at {first['origin']} by "
            f"{(dep_dt - timedelta(hours=2)).strftime('%-I:%M %p')} "
            f"(2 hours before the {first['dep']} departure)."
        )
    else:
        checkin = "This trip's first leg already departed."
        leave = "No airport timing needed."

    headline = (
        f"{scored['name']}: {len(scored['legs'])} leg(s), overall trip risk "
        f"{scored['trip_band']}."
    )
    watch = [a["text"] for a in scored["alerts"][:3]]
    return {
        "headline": headline,
        "checkin": checkin,
        "leave_by": leave,
        "watch": watch,
        "alert_count": len(scored["alerts"]),
    }
