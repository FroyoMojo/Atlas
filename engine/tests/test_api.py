"""API tests against a throwaway TimescaleDB database.

  ENGINE_TEST_ADMIN_URL=postgresql://postgres@/postgres?host=/tmp&port=5433 python -m pytest -q

The URL needs CREATEDB; the test creates atlas_engine_test, applies engine/sql/schema.sql and
chain/sql/001_chain_tables.sql, seeds a small fixture, and drops the database afterwards.
Skipped when ENGINE_TEST_ADMIN_URL is not set. Never point it at the Tiger service.
"""
import datetime as dt
import os
from pathlib import Path

import psycopg
import pytest

ADMIN_URL = os.environ.get("ENGINE_TEST_ADMIN_URL")
pytestmark = pytest.mark.skipif(not ADMIN_URL, reason="ENGINE_TEST_ADMIN_URL not set")
ROOT = Path(__file__).resolve().parents[2]
TEST_DB = "atlas_engine_test"
UTC = dt.timezone.utc
T0 = dt.datetime(2026, 10, 11, 3, 0, tzinfo=UTC)


def _db_url(name: str) -> str:
    info = psycopg.conninfo.conninfo_to_dict(ADMIN_URL)
    info["dbname"] = name
    return psycopg.conninfo.make_conninfo(**info)


def _seed(conn):
    from app.evidence import evidence_hash, preimage

    conn.execute("""INSERT INTO gauges (gauge_id, name, lat, lon, trigger_ft, record_start, demo_ready) VALUES
        ('g-brays', 'Brays Bayou', 29.70, -95.40, 40, 1990, true),
        ('g-dry', 'Dry Creek', 29.90, -95.30, 50, 1990, false)""")
    for y in range(1980, 2026):  # 1980s are outside the comparable record
        brays = 45 if y in (1983, 1994, 2001, 2017) else 30   # 3 in-record exceedances / 36 years
        conn.execute("INSERT INTO annual_peaks VALUES ('g-brays', %s, %s, NULL), ('g-dry', %s, 20, NULL)", (y, brays, y))
    for i in range(10):
        conn.execute("INSERT INTO sim_policies VALUES (%s, %s, 500, 40)", (i, "g-brays" if i < 6 else "g-dry"))
    for h in range(48):
        conn.execute("INSERT INTO gauge_readings (event_time, gauge_id, stage_ft, source, run_id) VALUES (%s, 'g-brays', %s, 'usgs', 'live')",
                     (T0 - dt.timedelta(hours=48 - h), 20 + h * 0.1))
    run = "run-t"
    conn.execute("""INSERT INTO runs (run_id, source, started_wall, clock, status, opening_vault, opening_float)
                    VALUES (%s, 'replay', now() - INTERVAL '1 hour', %s, 'running', 5300, 2000)""", (run, T0 + dt.timedelta(hours=3)))
    for i, stage in enumerate([38, 41, 42.5, 43]):
        conn.execute("INSERT INTO gauge_readings (event_time, gauge_id, stage_ft, source, run_id) VALUES (%s, 'g-brays', %s, 'replay', %s)",
                     (T0 + dt.timedelta(minutes=15 * i), stage, run))
    conn.execute("INSERT INTO gauge_readings (event_time, gauge_id, stage_ft, source, run_id, rejected) VALUES (%s, 'g-brays', 99, 'replay', %s, true)",
                 (T0 + dt.timedelta(minutes=5), run))
    opened = T0 + dt.timedelta(minutes=30)
    pre = preimage("g-brays", 42.5, opened, run, f"{run}-s1", f"{run}-e1")
    conn.execute("INSERT INTO storms VALUES (%s, %s, %s, NULL, 1, NULL, 'open')", (f"{run}-s1", run, opened))
    conn.execute("""INSERT INTO gauge_events (event_id, run_id, storm_id, gauge_id, opened_at, latched_value, preimage, evidence_hash)
                    VALUES (%s, %s, %s, 'g-brays', %s, 42.5, %s, %s)""", (f"{run}-e1", run, f"{run}-s1", opened, pre, evidence_hash(pre)))
    conn.execute("""INSERT INTO ledger (run_id, entry_id, account, amount) VALUES
        ('session', 'p1', 'holders', -48), ('session', 'p1', 'premiums', 48),
        (%(r)s, 'p2', 'holders', -52), (%(r)s, 'p2', 'premiums', 52),
        (%(r)s, 'pay1', 'float', -500), (%(r)s, 'pay1', 'holders', 500)""", {"r": run})
    conn.execute("""INSERT INTO payout_intents (intent_id, run_id, storm_id, event_id, policy_mint, owner, gauge_id, kind, amount,
                    tx_sig, last_valid_block_height, status, confirmed_wall)
                    VALUES ('i1', %s, %s, %s, 'MINT1', 'OWNER1', 'g-brays', 'interim', 500, 'SIG1', 1, 'confirmed', now())""",
                 (run, f"{run}-s1", f"{run}-e1"))
    conn.execute("CALL refresh_continuous_aggregate('gauge_hourly', NULL, NULL)")


@pytest.fixture(scope="module")
def client():
    with psycopg.connect(ADMIN_URL, autocommit=True) as admin:
        admin.execute(f"DROP DATABASE IF EXISTS {TEST_DB}")
        admin.execute(f"CREATE DATABASE {TEST_DB}")
    url = _db_url(TEST_DB)
    with psycopg.connect(url, autocommit=True) as conn:
        conn.execute((ROOT / "engine/sql/schema.sql").read_text())
        conn.execute((ROOT / "chain/sql/001_chain_tables.sql").read_text())
        _seed(conn)

    os.environ["DATABASE_URL"] = url
    os.environ["ADMIN_TOKEN"] = "test-token"
    from app import db, main, settings
    settings.DATABASE_URL, settings.ADMIN_TOKEN, settings.REPLAY_CMD = url, "test-token", ""
    main._cache.clear()
    main.chain_balances = lambda fresh=False: {"vault": 5352, "float": 1500, "bond_units": 0, "ausd_supply": 1, "at": ""}
    from fastapi.testclient import TestClient
    with TestClient(main.app) as c:
        yield c
    db.close()
    with psycopg.connect(ADMIN_URL, autocommit=True) as admin:
        admin.execute(f"DROP DATABASE IF EXISTS {TEST_DB}")


def test_replay_status(client):
    assert client.get("/replay/status").json() == {"run_id": "run-t", "status": "running", "clock": "2026-10-11T06:00:00Z", "streaming": False}


def test_gauges(client):
    g = {x["gauge_id"]: x for x in client.get("/gauges").json()}
    assert g["g-brays"]["status"] == "triggered" and g["g-brays"]["latest_ft"] == 43
    assert g["g-dry"]["latest_ft"] is None and g["g-dry"]["status"] == "normal"
    assert list(g)[0] == "g-brays"   # demo-ready first
    assert client.get("/gauges?run_id=nope").status_code == 404


def test_series(client):
    s = client.get("/gauges/g-brays/series").json()
    assert [p["stage_ft"] for p in s["points"]] == [38, 41, 42.5, 43]
    assert s["rejected_count"] == 1 and s["trigger_ft"] == 40
    assert client.get("/gauges/zzz/series").status_code == 404


def test_quote_freezes_during_event(client):
    q = client.get("/quote?gauge=g-brays&payout=500").json()
    assert q["years"] == 36 and q["exceedances"] == 3
    assert q["band"][0] <= q["premium"] <= q["band"][1]
    assert q["sales_open"] is False and "Trigger event" in q["reason"]
    assert client.get("/quote?gauge=g-dry&payout=500").json()["sales_open"] is True
    assert client.get("/quote?gauge=g-brays&payout=0").status_code == 422


def test_pool_reconciles(client):
    p = client.get("/pool").json()
    on, sim = p["onchain"], p["simulated"]
    assert on["premiums_in"] == 100 and on["payouts_out"] == 500
    assert on["reserve"] == 0 and on["bond_capital"] == 4900       # 400 reserve used, then 100 of bond
    assert on["reconciled"] is True, on["reconcile_detail"]        # 5300 + 52 = 5352; 2000 - 500 = 1500
    assert sim["policies"] == 10 and sim["harvey_loss"] == 3000 and sim["f_fin"] <= 1


def test_storms_and_ledger(client):
    [s] = client.get("/storms").json()
    assert s["status"] == "open" and s["events"][0]["value"] == 42.5
    assert s["payouts"] == [{"policy": "MINT1", "kind": "interim", "amount": 500, "tx_sig": "SIG1", "owner": "OWNER1", "gauge_id": "g-brays"}]
    led = client.get("/ledger").json()
    assert sum(led["totals"].values()) == 0 and len(led["rows"]) == 4


def test_stress(client):
    h = client.get("/stress?scenario=harvey").json()
    assert h["water_year"] == 2017 and h["aggregate_loss"] == 3000
    assert client.get("/stress?scenario=nope").status_code == 422


def test_admin(client, monkeypatch):
    import time
    from app import main, replay
    H = {"X-Admin-Token": "test-token"}
    assert client.post("/replay/start").status_code == 401
    assert client.post("/replay/start", headers={"X-Admin-Token": "wrong"}).status_code == 401
    assert client.post("/replay/start", headers={"X-Admin-Token": "tést".encode("latin-1")}).status_code == 401   # non-ASCII: 401, not 500

    r = client.post("/replay/start", headers=H).json()
    assert r["opening"] == {"vault": 5352, "float": 1500}
    assert client.get("/replay/status").json()["run_id"] == r["run_id"]
    # The superseded fixture run is marked reset, so the bot stops paying its open storm.
    assert client.get("/replay/status").json()["run_id"] != "run-t"
    assert client.get("/storms?run_id=run-t").json()[0]["status"] == "open"
    old = main.db.one("SELECT status, reset_wall FROM runs WHERE run_id = 'run-t'")
    assert old["status"] == "reset" and old["reset_wall"] is not None   # the chain books by this time

    # The fixture has no Harvey data, so this replay fails: the run must not stay "running".
    for _ in range(50):
        if not replay.running():
            break
        time.sleep(0.1)
    assert client.get("/replay/status").json() | {"clock": None} == {
        "run_id": r["run_id"], "status": "done", "clock": None, "streaming": False}

    # A second Start in the same second gets its own id instead of a 500.
    r2 = client.post("/replay/start", headers=H).json()
    r3 = client.post("/replay/start", headers=H).json()
    assert len({r["run_id"], r2["run_id"], r3["run_id"]}) == 3

    monkeypatch.setattr(main.httpx, "post", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("chain down")))
    reset = client.post("/replay/reset", headers=H).json()
    assert reset["run_id"] == r3["run_id"] and "chain down" in reset["chain_error"]
    assert client.get("/replay/status").json()["status"] == "reset"
    assert client.get("/gauges").json()[0]["status"] != "triggered"   # back to live after reset


def test_admin_check(client):
    assert client.get("/admin/check").status_code == 401
    assert client.get("/admin/check", headers={"X-Admin-Token": "test-token"}).json() == {"ok": True}


def test_admin_lock(client):
    from app import main
    assert main._admin_lock.acquire(blocking=False)
    try:
        assert client.post("/replay/reset", headers={"X-Admin-Token": "test-token"}).status_code == 409
    finally:
        main._admin_lock.release()


def test_gauge_rates_used_only_at_current_trigger(client):
    """Event counts made at an old trigger (before set_triggers.py) must not price the quote."""
    from app import main
    main.db.execute("INSERT INTO gauge_rates (gauge_id, iv_years, iv_counts, trigger_ft) VALUES "
                    "('g-brays', '{2020,2021}', '{2,2}', 99)")
    main._cache.clear()
    stale = client.get("/quote?gauge=g-brays&payout=500").json()
    assert stale["lambda_iv"] is None and stale["lambda"] == stale["lambda_peak"]
    main.db.execute("UPDATE gauge_rates SET trigger_ft = 40 WHERE gauge_id = 'g-brays'")
    main._cache.clear()
    fresh = client.get("/quote?gauge=g-brays&payout=500").json()
    assert fresh["lambda_iv"] == 2.0 and fresh["lambda"] == 2.0 and fresh["premium"] > stale["premium"]
    assert fresh["term_days"] == 90
    main.db.execute("DELETE FROM gauge_rates")
    main._cache.clear()
