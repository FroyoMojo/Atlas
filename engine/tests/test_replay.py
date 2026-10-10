"""Replay streamer on synthetic readings: guard, gaps, two-reading open, 72 h close, f_int / f_fin.

Same setup as test_api.py: needs ENGINE_TEST_ADMIN_URL (a local TimescaleDB with CREATEDB).
"""
import datetime as dt
import os
from pathlib import Path

import psycopg
import pytest
from psycopg.rows import dict_row

ADMIN_URL = os.environ.get("ENGINE_TEST_ADMIN_URL")
pytestmark = pytest.mark.skipif(not ADMIN_URL, reason="ENGINE_TEST_ADMIN_URL not set")
ROOT = Path(__file__).resolve().parents[2]
TEST_DB = "atlas_replay_test"
UTC = dt.timezone.utc
W0 = dt.datetime(2017, 8, 25, tzinfo=UTC)


def flood(h: float, r: float) -> float:
    """20 ft base; rises 1.25 ft per 15 min from hour r to 45 ft, holds 10 h, falls back."""
    if h < r or h > r + 20:
        return 20.0
    if h < r + 5:
        return 20 + 5 * (h - r)
    if h <= r + 15:
        return 45.0
    return 45 - 5 * (h - r - 15)


def stage_a(h: float) -> float | None:
    if 31 <= h < 35:
        return None                      # gauge dark: no reading at all
    if h == 10:
        return 99.0                      # spike: rejected by the guard
    return flood(h, 25)                  # at or above 40 ft from 29.0 to 41.0


def stage_b(h: float) -> float:
    return flood(h, 35)                  # at or above 40 ft from 39.0 to 51.0


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
                     ('A', 'A', 0, 0, 40, true), ('B', 'B', 0, 0, 40, true), ('C', 'C', 0, 0, 40, false)""")
        rows = []
        for i in range(200 * 4 + 1):
            h = i / 4
            t = W0 + dt.timedelta(hours=h)
            if (s := stage_a(h)) is not None:
                rows.append((t, "A", s))
            rows.append((t, "B", stage_b(h)))
            rows.append((t, "C", 10.0))
        with c.cursor() as cur:
            cur.executemany("INSERT INTO gauge_readings (event_time, gauge_id, stage_ft, source, run_id) VALUES (%s, %s, %s, 'usgs', 'live')", rows)
        c.execute("""INSERT INTO policies VALUES
            ('PA', 'OA', 'A', 500, 48, now() - interval '1 day', now() + interval '365 days', 'ACTV', 0, true),
            ('PB', 'OB', 'B', 500, 48, now() - interval '1 day', now() + interval '365 days', 'ACTV', 0, true)""")
    yield url
    with psycopg.connect(ADMIN_URL, autocommit=True) as admin:
        admin.execute(f"DROP DATABASE IF EXISTS {TEST_DB}")


def new_run(url: str, run_id: str, opening_vault: float) -> dt.datetime:
    started = dt.datetime(2026, 10, 10, 12, 0, tzinfo=UTC)
    with psycopg.connect(url, autocommit=True) as c:
        c.execute("INSERT INTO runs (run_id, source, started_wall, status, opening_vault, opening_float) VALUES (%s, 'replay', %s, 'running', %s, 2000)",
                  (run_id, started, opening_vault))
    return started


def test_replay(db_url, monkeypatch):
    from app import replay, settings
    from app.evidence import evidence_hash
    monkeypatch.setattr(settings, "DATABASE_URL", db_url)
    monkeypatch.setenv("REPLAY_WINDOW_START", W0.isoformat())
    monkeypatch.setenv("REPLAY_WINDOW_END", (W0 + dt.timedelta(hours=200)).isoformat())
    monkeypatch.delenv("FORCE_F_INT", raising=False)
    started = new_run(db_url, "r1", 600)
    assert replay.Replay("r1", seconds=0).run() == "done"

    with psycopg.connect(db_url, row_factory=dict_row) as c:
        ev = {e["gauge_id"]: e for e in c.execute("SELECT * FROM gauge_events WHERE run_id = 'r1'")}
        assert set(ev) == {"A", "B"}                                   # C never crosses
        at = lambda h: started + dt.timedelta(hours=h)
        assert ev["A"]["opened_at"] == at(29.25)                       # second consecutive reading
        assert ev["A"]["closed_at"] == at(113)                         # 72 h after the last reading above (41 h)
        assert ev["B"]["opened_at"] == at(39.25) and ev["B"]["closed_at"] == at(123)
        assert evidence_hash(ev["A"]["preimage"]) == ev["A"]["evidence_hash"]
        assert ev["A"]["preimage"] == "atlas|v3|A|41.25|2026-10-11T17:15:00Z|r1|r1-s1|r1-e1|-|-"
        [s] = c.execute("SELECT * FROM storms WHERE run_id = 'r1'").fetchall()
        # A = 600 against 1,000 at risk (both gauges under a flood watch at open), so f_int = 0.6
        assert float(s["f_int"]) == 0.6 and float(s["f_fin"]) == 0.6
        assert s["status"] == "closed" and s["closed_at"] == at(123)   # all events closed before the window ends
        rej = c.execute("SELECT event_time, stage_ft FROM gauge_readings WHERE run_id = 'r1' AND rejected").fetchall()
        assert [(r["event_time"], r["stage_ft"]) for r in rej] == [(at(10), 99.0)]   # spike only; the gap is fine
        alerts = {a["gauge_id"]: a for a in c.execute("SELECT * FROM replay_alerts WHERE run_id = 'r1'")}
        assert alerts["A"]["starts_at"] == at(5.25) and set(alerts) == {"A", "B"}
        run = c.execute("SELECT * FROM runs WHERE run_id = 'r1'").fetchone()
        assert run["status"] == "done" and run["clock"] == at(200)


def test_force_f_int_and_stop(db_url, monkeypatch):
    import threading
    from app import replay, settings
    monkeypatch.setattr(settings, "DATABASE_URL", db_url)
    monkeypatch.setenv("REPLAY_WINDOW_START", W0.isoformat())
    monkeypatch.setenv("REPLAY_WINDOW_END", (W0 + dt.timedelta(hours=200)).isoformat())
    monkeypatch.setenv("FORCE_F_INT", "0.5")
    new_run(db_url, "r2", 100_000)
    assert replay.Replay("r2", seconds=0).run() == "done"
    with psycopg.connect(db_url, row_factory=dict_row) as c:
        s = c.execute("SELECT f_int, f_fin FROM storms WHERE run_id = 'r2'").fetchone()
        assert (float(s["f_int"]), float(s["f_fin"])) == (0.5, 1.0)   # true-up rehearsal [V8]

    new_run(db_url, "r3", 600)
    stop = threading.Event()
    stop.set()
    assert replay.Replay("r3", stop, seconds=60).run() == "stopped"
