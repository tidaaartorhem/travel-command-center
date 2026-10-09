"""Itinerary CSV ingest: parse raw itinerary rows into trip objects.

CSV schema (header required):
  trip_id,trip_name,flight,carrier,origin,dest,date,dep,arr,confirmation

- date: YYYY-MM-DD, dep/arr: HH:MM 24h (scheduled local airport time)
- legs are ordered by leg_no if present, else by row order.

The raw rows are business data (your confirmation emails / TMC export); this
module turns them into the trip structures the risk engine consumes.
"""
from __future__ import annotations

import csv
from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, List


@dataclass
class Leg:
    flight: str
    carrier: str          # 2-letter carrier code, e.g. UA
    origin: str           # 3-letter IATA
    dest: str
    date: str             # YYYY-MM-DD
    dep: str              # HH:MM
    arr: str              # HH:MM
    confirmation: str = ""


@dataclass
class Trip:
    trip_id: str
    name: str
    legs: List[Leg] = field(default_factory=list)


REQUIRED = ["trip_id", "flight", "carrier", "origin", "dest", "date", "dep", "arr"]
OPTIONAL = ["trip_name", "leg_no", "confirmation"]


def parse_date(s: str) -> str:
    return datetime.strptime(s.strip(), "%Y-%m-%d").strftime("%Y-%m-%d")


def parse_time(s: str) -> str:
    return datetime.strptime(s.strip(), "%H:%M").strftime("%H:%M")


def load_itineraries(path: str) -> List[Trip]:
    """Read an itinerary CSV, return one Trip per trip_id with legs in order."""
    with open(path, newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        missing = [c for c in REQUIRED if c not in (reader.fieldnames or [])]
        if missing:
            raise ValueError(f"itinerary CSV missing required columns: {missing}")
        rows = list(reader)

    def leg_key(row: Dict[str, str]):
        return int(row["leg_no"]) if row.get("leg_no") else 0

    rows.sort(key=lambda r: (r["trip_id"], leg_key(r)))
    trips: Dict[str, Trip] = {}
    for r in rows:
        tid = r["trip_id"].strip()
        if tid not in trips:
            trips[tid] = Trip(trip_id=tid, name=(r.get("trip_name") or tid).strip())
        trips[tid].legs.append(
            Leg(
                flight=r["flight"].strip(),
                carrier=r["carrier"].strip().upper(),
                origin=r["origin"].strip().upper(),
                dest=r["dest"].strip().upper(),
                date=parse_date(r["date"]),
                dep=parse_time(r["dep"]),
                arr=parse_time(r["arr"]),
                confirmation=(r.get("confirmation") or "").strip(),
            )
        )
    out = list(trips.values())
    for t in out:
        if not t.legs:
            raise ValueError(f"trip {t.trip_id} has no legs")
    return out
