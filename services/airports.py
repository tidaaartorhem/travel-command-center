"""Airport context from OpenFlights airports.dat (public domain mirror).

airports.dat columns (14, quoted CSV, no header):
  id,name,city,country,iata,icao,lat,lon,alt,utc_offset,dst,tz,type,source
"""
from __future__ import annotations

import csv
from dataclasses import dataclass
from typing import Dict, List, Optional


@dataclass(frozen=True)
class Airport:
    iata: str
    name: str
    city: str
    country: str
    lat: float
    lon: float


def load_airports(path: str, codes: Optional[List[str]] = None) -> Dict[str, Airport]:
    wanted = {c.upper() for c in codes} if codes else None
    out: Dict[str, Airport] = {}
    with open(path, newline="", encoding="utf-8") as fh:
        for row in csv.reader(fh):
            if len(row) < 14:
                continue
            iata = row[4].strip().upper()
            if not iata or iata == "\\N":
                continue
            if wanted is not None and iata not in wanted:
                continue
            try:
                lat, lon = float(row[6]), float(row[7])
            except ValueError:
                continue
            out[iata] = Airport(
                iata=iata, name=row[1].strip(), city=row[2].strip(),
                country=row[3].strip(), lat=lat, lon=lon,
            )
    return out
