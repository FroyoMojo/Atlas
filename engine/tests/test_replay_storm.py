"""Replay storm accounting: a gauge with two events in one storm counts once in f_fin, and
readings with no stage are gaps, not rejections. Needs ENGINE_TEST_ADMIN_URL (see test_api.py)."""
import datetime as dt
import os
from pathlib import Path

import psycopg
import pytest
from psycopg.rows import dict_row

ADMIN_URL = os.environ.get("ENGINE_TEST_ADMIN_URL")
pytestmark = pytest.mark.skipif(not ADMIN_URL, reason="ENGINE_TEST_ADMIN_URL not set")
ROOT = Path(__file__).resolve().parents[2]
TEST_DB = "atlas_storm_test"
UTC = dt.timezone.utc
W0 = dt.datetime(2017, 8, 25, tzinfo=UTC)


def ramp(h: float, up: float, down: float) -> float:
    """20 ft base; up 1.25 ft per 15 min from `up` to 45 ft, holds, back down from `down`."""
    if h < up or h > down + 5:
        return 20.0
    if h < up + 5:
        return 20 + 5 * (h - up)
    if h <= down:
        return 45.0
    return 45 - 5 * (h - down)


@pytest.fixture(scope="module")
def db_url():
    with psycopg.connect(ADMIN_URL, autocommit=True) as admin:
        admin.execute(f"DROP DATABASE IF EXISTS {TEST_DB}")
        admin.execute(f"CREATE DATABASE {TEST_DB}")
    info = psycopg.conninfo.conninfo_to_dict(ADMIN_URL)
    info["dbname"] = TEST_DB
    url = psycopg.conninfo.make_conninfo(**info)
    with psycopg.connect(url, autocommit=True) as c:
        c.execute((ROOT / "engine/sql/schema.sql").read_text())
        c.execute("""INSERT INTO gauges (gauge_id, name, lat, lon, trigger_ft, demo_ready) VALUES
                     ('D', 'D', 0, 0, 40, true), ('E', 'E', 0, 0, 40, true)""")
        rows = []
        for i in range(240 * 4 + 1):
            h = i / 4
            t = W0 + dt.timedelta(hours=h)
            d = max(ramp(h, 10, 21), ramp(h, 110, 121))     # D: two floods, 4 days apart
            if 50 <= h < 51:
                rows.append((t, "D", None, 100.0))           # discharge only: a gap, not rejected
            else:
                rows.append((t, "D", d, None))
            rows.append((t, "E", ramp(h, 15, 145), None))    # E: one long flood keeps the storm open
        with c.cursor() as cur:
            cur.executemany("""INSERT INTO gauge_readings (event_time, gauge_id, stage_ft, discharge_cfs, source, run_id)
                               VALUES (%s, %s, %s, %s, 'usgs', 'live')""", rows)
        c.execute("""INSERT INTO policies VALUES
            ('PD', 'OD', 'D', 500, 48, now() - interval '1 day', now() + interval '365 days', 'ACTV', 0, true),
            ('PE', 'OE', 'E', 500, 48, now() - interval '1 day', now() + interval '365 days', 'ACTV', 0, true)""")
        c.execute("""INSERT INTO runs (run_id, source, started_wall, status, opening_vault, opening_float)
                     VALUES ('s1', 'replay', '2026-10-10T12:00:00Z', 'running', 600, 2000)""")
    yield url
    with psycopg.connect(ADMIN_URL, autocommit=True) as admin:
        admin.execute(f"DROP DATABASE IF EXISTS {TEST_DB}")


def test_two_events_one_storm(db_url, monkeypatch):
    from app import replay, settings
    monkeypatch.setattr(settings, "DATABASE_URL", db_url)
    monkeypatch.setenv("REPLAY_WINDOW_START", "2017-08-25T00:00:00")      # naive: read as UTC
    monkeypatch.setenv("REPLAY_WINDOW_END", "2017-09-04T00:00:00Z")
    monkeypatch.setenv("FORCE_F_INT", "0.3")
    assert replay.Replay("s1", seconds=0).run() == "done"
    with psycopg.connect(db_url, row_factory=dict_row) as c:
        ev = c.execute("SELECT gauge_id, opened_at, closed_at, storm_id FROM gauge_events ORDER BY opened_at").fetchall()
        assert [e["gauge_id"] for e in ev] == ["D", "E", "D"]
        assert {e["storm_id"] for e in ev} == {"s1-s1"}                      # E kept the storm open
        start = dt.datetime(2026, 10, 10, 12, tzinfo=UTC)                     # naive window start = UTC
        assert ev[0]["opened_at"] == start + dt.timedelta(hours=14.25)
        s = c.execute("SELECT f_int, f_fin FROM storms").fetchone()
        # A = 600 over D and E once each (1,000): 0.6. Counting D twice would give 0.4.
        assert (float(s["f_int"]), float(s["f_fin"])) == (0.3, 0.6)
        n = c.execute("SELECT count(*) FILTER (WHERE rejected) AS rej, count(*) FILTER (WHERE stage_ft IS NULL) AS gaps "
                      "FROM gauge_readings WHERE run_id = 's1'").fetchone()
        assert (n["rej"], n["gaps"]) == (0, 4)
