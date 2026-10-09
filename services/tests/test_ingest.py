import csv

import pytest

from services.ingest import load_itineraries


def write_csv(path, rows):
    with open(path, "w", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["trip_id", "trip_name", "leg_no", "flight", "carrier",
                    "origin", "dest", "date", "dep", "arr", "confirmation"])
        w.writerows(rows)


def test_load_groups_legs_into_trips(tmp_path):
    p = tmp_path / "t.csv"
    write_csv(p, [
        ["t1", "NYC Loop", 2, "UA 222", "UA", "ORD", "JFK", "2026-10-20", "17:00", "20:15", "ABC1"],
        ["t1", "NYC Loop", 1, "UA 111", "UA", "YYZ", "ORD", "2026-10-20", "08:00", "09:20", "ABC1"],
        ["t2", "LA Sprint", 1, "AA 333", "AA", "YYZ", "LAX", "2026-10-21", "07:30", "09:55", "XYZ9"],
    ])
    trips = load_itineraries(str(p))
    assert len(trips) == 2
    t1 = next(t for t in trips if t.trip_id == "t1")
    assert [l.flight for l in t1.legs] == ["UA 111", "UA 222"]  # ordered by leg_no
    assert t1.legs[0].carrier == "UA"


def test_codes_normalized_uppercase(tmp_path):
    p = tmp_path / "t.csv"
    write_csv(p, [["t1", "", 1, "AC 100", "ac", "yyz", "ord", "2026-10-20", "08:00", "09:20", ""]])
    trips = load_itineraries(str(p))
    assert trips[0].legs[0].origin == "YYZ"


def test_missing_column_raises(tmp_path):
    p = tmp_path / "t.csv"
    with open(p, "w") as fh:
        fh.write("trip_id,flight\nt1,UA 1\n")
    with pytest.raises(ValueError):
        load_itineraries(str(p))


def test_bad_date_raises(tmp_path):
    p = tmp_path / "t.csv"
    write_csv(p, [["t1", "", 1, "UA 1", "UA", "YYZ", "ORD", "20-10-2026", "08:00", "09:20", ""]])
    with pytest.raises(ValueError):
        load_itineraries(str(p))
