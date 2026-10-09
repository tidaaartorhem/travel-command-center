"""End-to-end: raw BTS zip + airports + seed CSV -> derived JSON bundle."""
import json
import os

from services.main import build

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def test_build_bundle_shape():
    bundle = build(
        os.path.join(REPO, "data", "raw", "otp_2026_7.zip"),
        os.path.join(REPO, "data", "raw", "airports.dat"),
        os.path.join(REPO, "data", "raw", "seed_trips.csv"),
        "2026-10-09",
    )
    assert bundle["summary"]["trips"] == 3
    assert bundle["summary"]["legs"] == 5
    assert bundle["summary"]["routes_scored"] > 5000
    assert bundle["summary"]["bts_rows"] > 500000

    by_id = {t["trip_id"]: t for t in bundle["trips"]}
    deal = by_id["dealrun-ord-lax"]
    assert deal["trip_band"] == "HIGH"
    assert deal["connections"][0]["tight"] is True  # 45-min ORD layover
    mia = by_id["allhands-atl-mia"]
    assert mia["connections"][0]["misconnect_prob"] is not None
    assert 0.3 < mia["connections"][0]["misconnect_prob"] < 0.5

    # every leg that has stats cites real observations
    for t in bundle["trips"]:
        for leg in t["legs"]:
            if leg["stats"] is not None:
                assert leg["stats"]["flights"] >= 30

    # bundle is JSON-serializable and airports resolve for every leg endpoint
    json.dumps(bundle)
    for t in bundle["trips"]:
        for leg in t["legs"]:
            assert leg["origin"] in bundle["airports"]
            assert leg["dest"] in bundle["airports"]


def test_provenance_matches_data():
    prov = json.load(open(os.path.join(REPO, "data", "provenance.json")))
    bts = next(s for s in prov["sources"] if "Bureau" in s["name"])
    assert bts["month"] == "2026-07"
    assert bts["rows"] > 500000
    assert bts["routes_aggregated"] > 5000
