import pandas as pd
import pytest

from services.risk import (
    RouteStats, aggregate_bts, disruption_band, great_circle_km,
    layover_min, leg_duration_min, minimum_connection_time,
    misconnect_band, misconnect_probability,
)


def sample_frame():
    return pd.DataFrame([
        {"OP_CARRIER": "UA", "ORIGIN": "ORD", "DEST": "LAX", "CANCELLED": 0, "ARR_DELAY": 5.0, "DIVERTED": 0},
        {"OP_CARRIER": "UA", "ORIGIN": "ORD", "DEST": "LAX", "CANCELLED": 0, "ARR_DELAY": 30.0, "DIVERTED": 0},
        {"OP_CARRIER": "UA", "ORIGIN": "ORD", "DEST": "LAX", "CANCELLED": 1, "ARR_DELAY": float("nan"), "DIVERTED": 0},
        {"OP_CARRIER": "AA", "ORIGIN": "DFW", "DEST": "MIA", "CANCELLED": 0, "ARR_DELAY": -5.0, "DIVERTED": 0},
    ])


def test_aggregate_bts_counts():
    routes = aggregate_bts(sample_frame())
    ua = routes[("UA", "ORD", "LAX")]
    assert ua.flights == 3
    assert ua.cancelled_pct == pytest.approx(33.33, abs=0.01)
    assert ua.on_time_pct == pytest.approx(50.0)
    assert ua.avg_arr_delay_min == pytest.approx(17.5)


def test_disruption_band_low():
    s = RouteStats("AA", "DFW", "MIA", 1000, 85.0, 8.0, 0.5)
    assert disruption_band(s) == "LOW"


def test_disruption_band_high():
    s = RouteStats("UA", "ORD", "LAX", 1000, 65.0, 45.0, 2.5)
    assert disruption_band(s) == "HIGH"


def test_disruption_band_elevated():
    s = RouteStats("UA", "ORD", "LAX", 1000, 75.0, 20.0, 1.2)
    assert disruption_band(s) == "ELEVATED"


def test_disruption_band_unknown_when_thin():
    assert disruption_band(RouteStats("UA", "ORD", "LAX", 5, 50.0, 90.0, 10.0)) == "UNKNOWN"
    assert disruption_band(None) == "UNKNOWN"


def test_minimum_connection_time():
    assert minimum_connection_time("ATL") == 60
    assert minimum_connection_time("BOS") == 45


def test_layover_min_overnight():
    assert layover_min("23:40", "00:55") == 75


def test_leg_duration_crosses_midnight():
    assert leg_duration_min("22:00", "01:30") == 210


def test_misconnect_illegal_connection_is_certain():
    s = RouteStats("UA", "ORD", "LAX", 1000, 80.0, 10.0, 0.5)
    assert misconnect_probability(30, 45, s) == 1.0


def test_misconnect_unknown_without_data():
    assert misconnect_probability(90, 45, None) == -1.0
    assert misconnect_band(-1.0) == "UNKNOWN"


def test_misconnect_generous_layover_low():
    s = RouteStats("UA", "ORD", "LAX", 1000, 85.0, 8.0, 0.5)
    p = misconnect_probability(240, 45, s)
    assert 0 <= p < 0.15
    assert misconnect_band(p) == "LOW"


def test_misconnect_tight_layover_high():
    s = RouteStats("UA", "ORD", "LAX", 1000, 60.0, 40.0, 2.0)
    p = misconnect_probability(50, 45, s)
    assert p >= 0.35
    assert misconnect_band(p) == "HIGH"


def test_great_circle_toronto_newyork():
    # YYZ (43.68, -79.63) to JFK (40.64, -73.78): ~590 km
    km = great_circle_km(43.6777, -79.6306, 40.6413, -73.7781)
    assert 550 < km < 630


def test_misconnect_deterministic():
    s = RouteStats("UA", "ORD", "LAX", 1000, 75.0, 20.0, 1.2)
    assert misconnect_probability(70, 45, s) == misconnect_probability(70, 45, s)
