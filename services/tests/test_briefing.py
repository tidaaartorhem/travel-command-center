from services.airports import load_airports
from services.briefing import morning_brief, score_trip
from services.ingest import Leg, Trip
from services.risk import RouteStats


def make_trip():
    return Trip(trip_id="t1", name="Chicago Deal Sprint", legs=[
        Leg("UA 512", "UA", "YYZ", "ORD", "2026-10-20", "07:55", "09:10", "ABC123"),
        Leg("UA 1188", "UA", "ORD", "LAX", "2026-10-20", "09:55", "12:05", "ABC123"),
    ])


def routes():
    return {
        ("UA", "YYZ", "ORD"): RouteStats("UA", "YYZ", "ORD", 500, 84.0, 9.0, 0.6),
        ("UA", "ORD", "LAX"): RouteStats("UA", "ORD", "LAX", 2000, 68.0, 32.0, 1.8),
    }


def test_score_trip_bands_and_connections():
    scored = score_trip(make_trip(), routes(), {})
    assert [l["band"] for l in scored["legs"]] == ["LOW", "HIGH"]
    conn = scored["connections"][0]
    assert conn["airport"] == "ORD"
    assert conn["layover_min"] == 45
    assert conn["mct_min"] == 60
    assert conn["tight"] is True
    assert conn["band"] == "HIGH"


def test_score_trip_overall_band_is_worst():
    scored = score_trip(make_trip(), routes(), {})
    assert scored["trip_band"] == "HIGH"


def test_score_trip_unknown_route():
    scored = score_trip(make_trip(), {}, {})
    assert all(l["band"] == "UNKNOWN" for l in scored["legs"])
    assert scored["alerts"]  # still produces a data-gap alert


def test_morning_brief_days_out():
    scored = score_trip(make_trip(), routes(), {})
    brief = morning_brief(scored, "2026-10-19")
    assert "opens today" in brief["checkin"]
    assert "ORD" in brief["leave_by"] or "YYZ" in brief["leave_by"]


def test_morning_brief_travel_day_deterministic():
    scored = score_trip(make_trip(), routes(), {})
    b1 = morning_brief(scored, "2026-10-20")
    b2 = morning_brief(scored, "2026-10-20")
    assert b1 == b2
    assert "travel day" in b1["checkin"]


def test_morning_brief_past_trip():
    scored = score_trip(make_trip(), routes(), {})
    brief = morning_brief(scored, "2026-10-25")
    assert "already departed" in brief["checkin"]


def test_load_airports_filters_codes(tmp_path):
    p = tmp_path / "airports.dat"
    p.write_text(
        '1,"A","CityA","CountryA","AAA","KAAA",1.0,2.0,0,0,"U","X","airport","OurAirports"\n'
        '2,"B","CityB","CountryB","BBB","KBBB",3.0,4.0,0,0,"U","X","airport","OurAirports"\n'
        '3,"C","CityC","CountryC","\\N","KCCC",5.0,6.0,0,0,"U","X","airport","OurAirports"\n'
    )
    aps = load_airports(str(p), ["AAA"])
    assert set(aps) == {"AAA"}
    assert aps["AAA"].name == "A"
