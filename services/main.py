"""CLI entry point: build the static site's derived bundle.

    python services/main.py --bts data/raw/otp_YYYY_M.csv --airports data/raw/airports.dat \\
        --trips data/raw/seed_trips.csv --out web/public/tripdata.json [--today YYYY-MM-DD]

The frontend never reads the raw BTS/OTP CSV; it renders only this bundle.
"""
from __future__ import annotations

import argparse
import json
import zipfile
from datetime import date

import pandas as pd


def read_bts_zip(path: str) -> pd.DataFrame:
    """Read the monthly OTP CSV from inside the downloaded BTS zip bundle."""
    with zipfile.ZipFile(path) as z:
        members = [m for m in z.namelist() if m.lower().endswith(".csv")]
        if not members:
            raise ValueError(f"no CSV member found in {path}")
        with z.open(members[0]) as fh:
            return pd.read_csv(
                fh,
                usecols=["IATA_CODE_Reporting_Airline", "Origin", "Dest",
                         "Cancelled", "ArrDelay", "Diverted"],
                dtype={"IATA_CODE_Reporting_Airline": str, "Origin": str, "Dest": str},
            )

from .airports import load_airports
from .briefing import morning_brief, score_trip
from .ingest import load_itineraries
from .risk import aggregate_bts, great_circle_km


def build(bts_path: str, airports_path: str, trips_path: str, today: str) -> dict:
    trips = load_itineraries(trips_path)

    df = read_bts_zip(bts_path).rename(columns={
        "IATA_CODE_Reporting_Airline": "OP_CARRIER",
        "Origin": "ORIGIN",
        "Dest": "DEST",
        "Cancelled": "CANCELLED",
        "ArrDelay": "ARR_DELAY",
        "Diverted": "DIVERTED",
    })
    routes = aggregate_bts(df)

    codes = sorted({leg.origin for t in trips for leg in t.legs} |
                   {leg.dest for t in trips for leg in t.legs})
    airports = load_airports(airports_path, codes)

    scored_trips = [score_trip(t, routes, airports) for t in trips]
    briefs = {s["trip_id"]: morning_brief(s, today) for s in scored_trips}

    route_table = [
        {"carrier": s.carrier, "origin": s.origin, "dest": s.dest,
         "flights": s.flights, "on_time_pct": s.on_time_pct,
         "avg_arr_delay_min": s.avg_arr_delay_min, "cancelled_pct": s.cancelled_pct}
        for s in routes.values()
    ]

    # airport cards for the UI + per-leg great-circle distance
    airport_cards = {
        code: {"iata": a.iata, "name": a.name, "city": a.city, "country": a.country}
        for code, a in airports.items()
    }
    for s, t in zip(scored_trips, trips):
        total_km = 0.0
        for scored_leg, leg in zip(s["legs"], t.legs):
            a, b = airports.get(leg.origin), airports.get(leg.dest)
            if a and b:
                km = round(great_circle_km(a.lat, a.lon, b.lat, b.lon), 1)
                scored_leg["distance_km"] = km
                total_km += km
        s["total_distance_km"] = round(total_km, 1)

    return {
        "generated": today,
        "trips": scored_trips,
        "briefs": briefs,
        "route_table": route_table,
        "airports": airport_cards,
        "summary": {
            "trips": len(scored_trips),
            "legs": sum(len(s["legs"]) for s in scored_trips),
            "routes_scored": len(routes),
            "bts_rows": len(df),
        },
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--bts", required=True)
    ap.add_argument("--airports", required=True)
    ap.add_argument("--trips", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--today", default=str(date.today()))
    args = ap.parse_args()

    bundle = build(args.bts, args.airports, args.trips, args.today)
    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(bundle, fh, indent=2)
    print(f"wrote {args.out}: {bundle['summary']['trips']} trips, "
          f"{bundle['summary']['legs']} legs, {bundle['summary']['routes_scored']} routes")


if __name__ == "__main__":
    main()
