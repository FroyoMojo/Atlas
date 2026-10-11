"""Atlas engine: FastAPI over Tiger Data, contract in docs/api.md (plan v3.1 section 4.2).

Read-only except the two admin replay controls. Python never builds or signs a Solana
transaction; reset goes through the chain service's POST /chain/reset.

  uvicorn app.main:app --port 8000        # from engine/
"""
import datetime as dt
import hmac
import logging
import os
import shlex
import subprocess
import threading
import time
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from . import db, pricing, replay, settings
from .db import num
from .evidence import self_test

logging.getLogger("atlas").setLevel(logging.INFO)
logging.getLogger("atlas").addHandler(logging.StreamHandler())
self_test()  # refuse to start if the evidence format drifted from docs/evidence.md


@asynccontextmanager
async def lifespan(_app: FastAPI):
    yield
    _stop_streamer()
    db.close()


app = FastAPI(title="Atlas engine", version="3.1", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=settings.CORS_ORIGINS, allow_methods=["*"], allow_headers=["*"])


# ---------- helpers ----------

def iso(t: dt.datetime | None) -> str | None:
    if t is None:
        return None
    return t.astimezone(dt.timezone.utc).isoformat().replace("+00:00", "Z")


def latest_run() -> dict | None:
    return db.one("SELECT * FROM runs ORDER BY started_wall DESC LIMIT 1")


def data_run(run_id: str | None) -> dict | None:
    """The run a read shows. Explicit run_id: that run. Default: the latest run, unless it was
    reset, in which case the dashboard is back to live data."""
    if run_id:
        run = db.one("SELECT * FROM runs WHERE run_id = %s", (run_id,))
        if run is None:
            raise HTTPException(404, f"Unknown run {run_id}")
        return run
    run = latest_run()
    return run if run and run["status"] != "reset" else None


def require_admin(token: str | None) -> None:
    if not settings.ADMIN_TOKEN:
        raise HTTPException(503, "ADMIN_TOKEN is not set on the engine")
    if not token or not hmac.compare_digest(token, settings.ADMIN_TOKEN):
        raise HTTPException(401, "Admin token required")


_cache: dict[str, tuple[float, object]] = {}
_cache_lock = threading.Lock()


def cached(key: str, ttl: float, fn):
    now = time.monotonic()
    with _cache_lock:
        hit = _cache.get(key)
        if hit and now - hit[0] < ttl:
            return hit[1]
    value = fn()
    with _cache_lock:
        _cache[key] = (now, value)
    return value


def chain_balances(fresh: bool = False) -> dict | None:
    """GET /chain/balances; cached for 5 s so polling dashboards don't hit the RPC."""
    def fetch():
        try:
            r = httpx.get(f"{settings.CHAIN_URL}/chain/balances", timeout=8)
            r.raise_for_status()
            return r.json()
        except Exception:
            return None
    if fresh:
        _cache.pop("balances", None)
    return cached("balances", 5, fetch)


def history(fresh: bool = False) -> dict:
    """Gauges, annual peaks (comparable record only) and the simulated book; cached 60 s.
    fresh=True reloads, so data loaded a moment ago shows up without waiting out the cache."""
    def load():
        gauges = {g["gauge_id"]: g for g in db.rows("SELECT * FROM gauges")}
        peaks: dict[str, dict[int, float]] = {}
        for r in db.rows(
            """SELECT p.gauge_id, p.water_year, p.peak_stage_ft FROM annual_peaks p JOIN gauges g USING (gauge_id)
               WHERE p.peak_stage_ft IS NOT NULL AND (g.record_start IS NULL OR p.water_year >= g.record_start)"""
        ):
            peaks.setdefault(r["gauge_id"], {})[r["water_year"]] = r["peak_stage_ft"]
        book = [pricing.BookPolicy(r["gauge_id"], num(r["payout_usd"]), num(r["premium_usd"]))
                for r in db.rows("SELECT gauge_id, payout_usd, premium_usd FROM sim_policies")]
        # Instantaneous event counts per complete water year (data/event_rate.py --store); the
        # table may not exist or may be empty, in which case quotes fall back to peaks only.
        event_counts: dict[str, list[int]] = {}
        try:
            for r in db.rows("SELECT gauge_id, iv_counts FROM gauge_rates"):
                event_counts[r["gauge_id"]] = list(r["iv_counts"])
        except Exception:
            pass
        triggers = {g: v["trigger_ft"] for g, v in gauges.items()}
        losses = pricing.year_losses(book, peaks, triggers)
        rates = {g: pricing.rate_higher_of(pricing.exceedances(list(peaks.get(g, {}).values()), triggers[g]),
                                           event_counts.get(g))
                 for g in {p.gauge_id for p in book} if g in triggers}
        mean_model = pricing.model_mean_loss(book, rates)
        capital = pricing.required_capital(losses, settings.HARVEY_WATER_YEAR, mean_model)
        total_b = sum(p.payout for p in book)
        reserve = pricing.reserve_from_book(book, capital, settings.COST_OF_CAPITAL, settings.EXPENSE_RATIO)
        return {"gauges": gauges, "peaks": peaks, "events": event_counts, "book": book, "losses": losses,
                "capital": capital, "total_b": total_b, "reserve": reserve, "mean_model": mean_model}
    if fresh:
        _cache.pop("history", None)
    return cached("history", 60, load)


def triggered_gauges(run_id: str) -> set[str]:
    return {r["gauge_id"] for r in db.rows("SELECT DISTINCT gauge_id FROM gauge_events WHERE run_id = %s", (run_id,))}


# ---------- reads ----------

@app.get("/health")
def health():
    db.one("SELECT 1 AS ok")
    return {"ok": True, "demo_mode": settings.DEMO_MODE}


@app.get("/replay/status")
def replay_status():
    run = latest_run()
    if run is None:
        return {"run_id": None, "status": None, "clock": None}
    clock = run["clock"] or (db.one(
        "SELECT max(event_time) AS t FROM gauge_readings WHERE run_id = %s", (run["run_id"],)) or {}).get("t")
    return {"run_id": run["run_id"], "status": run["status"], "clock": iso(clock), "streaming": replay.running()}


@app.get("/gauges")
def gauges(run_id: str | None = None):
    run = data_run(run_id)
    rid = run["run_id"] if run else None
    out = []
    for g in db.rows(
        """SELECT g.*, COALESCE(rr.stage_ft, lr.stage_ft) AS latest_ft,
                  EXISTS (SELECT 1 FROM gauge_events e WHERE e.gauge_id = g.gauge_id AND e.run_id = %(run)s) AS triggered
           FROM gauges g
           LEFT JOIN LATERAL (SELECT stage_ft FROM gauge_readings x
                              WHERE x.gauge_id = g.gauge_id AND x.run_id = %(run)s AND NOT x.rejected AND x.stage_ft IS NOT NULL
                              ORDER BY x.event_time DESC LIMIT 1) rr ON true
           LEFT JOIN LATERAL (SELECT stage_ft FROM gauge_readings x
                              WHERE x.gauge_id = g.gauge_id AND x.run_id = 'live' AND NOT x.rejected AND x.stage_ft IS NOT NULL
                              ORDER BY x.event_time DESC LIMIT 1) lr ON true
           ORDER BY g.demo_ready DESC, g.name""",
        {"run": rid},
    ):
        latest = g["latest_ft"]
        if g["triggered"]:
            status = "triggered"
        elif latest is not None and latest >= settings.NEAR_FRACTION * g["trigger_ft"]:
            status = "near"
        else:
            status = "normal"
        out.append({"gauge_id": g["gauge_id"], "name": g["name"], "lat": g["lat"], "lon": g["lon"],
                    "trigger_ft": g["trigger_ft"], "latest_ft": latest, "status": status,
                    "demo_ready": g["demo_ready"]})
    return out


@app.get("/gauges/{gauge_id}/series")
def series(gauge_id: str, run_id: str | None = None):
    g = db.one("SELECT * FROM gauges WHERE gauge_id = %s", (gauge_id,))
    if g is None:
        raise HTTPException(404, f"Unknown gauge {gauge_id}")
    run = data_run(run_id)
    if run:
        pts = db.rows(
            """SELECT event_time, stage_ft FROM gauge_readings
               WHERE gauge_id = %s AND run_id = %s AND NOT rejected AND stage_ft IS NOT NULL ORDER BY event_time""",
            (gauge_id, run["run_id"]))
        rej = db.one("SELECT count(*) AS n FROM gauge_readings WHERE gauge_id = %s AND run_id = %s AND rejected",
                     (gauge_id, run["run_id"]))["n"]
    else:
        # Live view: the last 7 days of hourly maxima from the continuous aggregate.
        pts = db.rows(
            """SELECT bucket AS event_time, max_stage AS stage_ft FROM gauge_hourly
               WHERE gauge_id = %(g)s AND run_id = 'live' AND max_stage IS NOT NULL
                 AND bucket > (SELECT max(bucket) FROM gauge_hourly WHERE gauge_id = %(g)s AND run_id = 'live') - INTERVAL '7 days'
               ORDER BY bucket""",
            {"g": gauge_id})
        rej = db.one(
            """SELECT count(*) AS n FROM gauge_readings WHERE gauge_id = %s AND run_id = 'live' AND rejected
               AND event_time > now() - INTERVAL '7 days'""", (gauge_id,))["n"]
    return {"points": [{"event_time": iso(p["event_time"]), "stage_ft": p["stage_ft"]} for p in pts],
            "trigger_ft": g["trigger_ft"], "rejected_count": rej}


def sales_status(gauge_id: str, run: dict | None) -> tuple[bool, str | None]:
    """Sales freeze while a trigger event or a flood watch/warning is active at the gauge (F5)."""
    if not run or run["status"] != "running":
        return True, None
    if db.one("SELECT 1 FROM gauge_events WHERE run_id = %s AND gauge_id = %s AND closed_at IS NULL",
              (run["run_id"], gauge_id)):
        return False, "Trigger event open at this gauge"
    clock = run["clock"] or dt.datetime.now(dt.timezone.utc)
    alert = db.one(
        """SELECT kind FROM replay_alerts WHERE run_id = %s AND gauge_id = %s AND starts_at <= %s AND ends_at > %s
           ORDER BY starts_at DESC LIMIT 1""", (run["run_id"], gauge_id, clock, clock))
    if alert:
        return False, f"{alert['kind'].replace('_', ' ').capitalize()} active at this gauge"
    return True, None


@app.get("/quote")
def quote(gauge: str, payout: float = Query(gt=0, le=100_000), run_id: str | None = None):
    h = history()
    if gauge not in h["gauges"] or gauge not in h["peaks"]:
        h = history(fresh=True)
    g = h["gauges"].get(gauge)
    if g is None:
        raise HTTPException(404, f"Unknown gauge {gauge}")
    by_year = h["peaks"].get(gauge, {})
    if not by_year:
        raise HTTPException(503, f"No annual peak history for gauge {gauge} yet")
    flags = pricing.exceedances(list(by_year.values()), g["trigger_ft"])
    counts = h["events"].get(gauge)
    lam = pricing.rate_higher_of(flags, counts)   # C3: higher of lambda_peak and lambda_iv
    k = pricing.k_share(h["capital"], payout, h["total_b"])
    args = (settings.TERM_YEARS, settings.THETA, settings.COST_OF_CAPITAL, k)
    prem = pricing.premium(payout, lam, *args, minimum=settings.MIN_PREMIUM)
    band = pricing.bootstrap_band_higher_of(flags, counts, payout, *args, n=settings.BOOTSTRAP_N,
                                            minimum=settings.MIN_PREMIUM)
    open_, reason = sales_status(gauge, data_run(run_id))
    return {"premium": round(prem, 2), "p_payout": pricing.p_payout(lam, settings.TERM_YEARS),
            "band": [round(band[0], 2), round(band[1], 2)], "k": round(k, 2),
            "waiting_days": 0 if settings.DEMO_MODE else 7, "sales_open": open_, "reason": reason,
            "years": len(flags), "exceedances": sum(flags),
            "lambda": round(lam, 4), "lambda_peak": round(pricing.annual_rate(flags), 4),
            "lambda_iv": round(sum(counts) / len(counts), 4) if counts else None,
            "term_days": round(settings.TERM_YEARS * 365)}


def ledger_sums(run_id: str | None = None) -> dict[str, float]:
    where, params = ("WHERE run_id = %s", (run_id,)) if run_id else ("", ())
    return {r["account"]: num(r["total"]) for r in
            db.rows(f"SELECT account, sum(amount) AS total FROM ledger {where} GROUP BY account", params)}


def reconcile(run: dict | None, bal: dict | None) -> tuple[bool, dict]:
    """opening + sum(this run's ledger rows) = chain balance now, for vault and float."""
    if run is None:
        return True, {"note": "no run to reconcile"}
    if bal is None or run["opening_vault"] is None or run["opening_float"] is None:
        return False, {"note": "missing chain balances or opening balances"}
    s = ledger_sums(run["run_id"])
    vault_exp = num(run["opening_vault"]) + s.get("premiums", 0) + s.get("reserve", 0) + s.get("bond", 0)
    float_exp = num(run["opening_float"]) + s.get("float", 0)
    detail = {"vault_expected": round(vault_exp, 6), "vault_chain": bal["vault"],
              "float_expected": round(float_exp, 6), "float_chain": bal["float"]}
    return abs(vault_exp - bal["vault"]) < 0.005 and abs(float_exp - bal["float"]) < 0.005, detail


def run_payouts(run_id: str) -> float:
    r = db.one("SELECT sum(amount) AS s FROM ledger WHERE run_id = %s AND account = 'holders' AND amount > 0", (run_id,))
    return num(r["s"]) or 0.0


@app.get("/pool")
def pool(run_id: str | None = None):
    run = data_run(run_id)
    bal = chain_balances()
    every = ledger_sums()

    # On-chain panel. Premiums stay in the vault on devnet (no expense withdrawal), so the
    # reserve is the seeded reserve plus every premium; losses hit it before the bond (7.4).
    bond_total = (settings.SNAPSHOT_VAULT - settings.SEED_RESERVE) + every.get("bond", 0)
    paid = run_payouts(run["run_id"]) if run else 0.0
    w = pricing.waterfall(paid, settings.SEED_RESERVE + every.get("premiums", 0), bond_total)
    ok, detail = reconcile(run, bal)
    onchain = {
        "seeded_capital": settings.SNAPSHOT_VAULT + settings.SNAPSHOT_FLOAT,
        "premiums_in": every.get("premiums", 0),
        "reserve": settings.SEED_RESERVE + every.get("premiums", 0) - w.reserve_used,
        "bond_capital": bond_total - w.bond_used,
        # Chain unreachable: estimate the float from the snapshot and this run's ledger rows.
        "float": bal["float"] if bal else settings.SNAPSHOT_FLOAT + (ledger_sums(run["run_id"]).get("float", 0) if run else 0),
        "nav_per_unit": round((bond_total - w.bond_used) / bond_total, 6) if bond_total > 0 else 1.0,
        "payouts_out": paid,
        "reconciled": ok,
        "reconcile_detail": detail,
        "vault": bal["vault"] if bal else None,
        "bond_units": bal["bond_units"] if bal else None,
    }

    # Simulated panel: the 2,000-policy book through this run's triggered gauges.
    h = history()
    book = h["book"]
    sim = {"policies": len(book), "worst_year_loss": 0.0, "harvey_loss": 0.0, "reserve_used": 0.0,
           "bond_used": 0.0, "f_int": 1.0, "f_fin": 1.0, "investor_loss_pct": 0.0}
    if book:
        losses = h["losses"]
        sim["worst_year_loss"] = max(losses.values(), default=0.0)
        sim["harvey_loss"] = losses.get(settings.HARVEY_WATER_YEAR, 0.0)
        if run:
            trig = triggered_gauges(run["run_id"])
            at_risk = trig | {g for g, v in h["gauges"].items() if v["demo_ready"]}
            available = max(0.0, h["reserve"]) + h["capital"]
            loss = sum(p.payout for p in book if p.gauge_id in trig)
            rw = pricing.waterfall(loss, h["reserve"], h["capital"])
            sim.update(reserve_used=rw.reserve_used, bond_used=rw.bond_used, investor_loss_pct=rw.investor_loss_pct,
                       f_int=pricing.pay_factor(available, sum(p.payout for p in book if p.gauge_id in at_risk)),
                       f_fin=pricing.pay_factor(available, loss))
    return {"onchain": onchain, "simulated": sim}


@app.get("/stress")
def stress(scenario: str = Query(pattern="^(harvey|worst_year)$")):
    h = history()
    if not h["book"] or not h["losses"]:
        h = history(fresh=True)
    if not h["book"] or not h["losses"]:
        raise HTTPException(503, "Simulated book or annual peaks not loaded yet")
    losses = h["losses"]
    year = settings.HARVEY_WATER_YEAR if scenario == "harvey" else max(losses, key=losses.get)
    w = pricing.waterfall(losses.get(year, 0.0), h["reserve"], h["capital"])
    return {"aggregate_loss": w.loss, "reserve_used": w.reserve_used, "bond_used": w.bond_used,
            "f_fin": w.f_fin, "investor_loss_pct": w.investor_loss_pct, "water_year": year,
            "capital": h["capital"], "reserve": h["reserve"]}


@app.get("/storms")
def storms(run_id: str | None = None):
    run = data_run(run_id)
    if run is None:
        return []
    rid = run["run_id"]
    events: dict[str, list] = {}
    for e in db.rows("SELECT * FROM gauge_events WHERE run_id = %s ORDER BY opened_at", (rid,)):
        events.setdefault(e["storm_id"], []).append({
            "event_id": e["event_id"], "gauge_id": e["gauge_id"], "opened_at": iso(e["opened_at"]),
            "closed_at": iso(e["closed_at"]), "value": e["latched_value"],
            "evidence_hash": e["evidence_hash"], "preimage": e["preimage"]})
    payouts: dict[str, list] = {}
    if db.table_exists("payout_intents"):
        for p in db.rows("""SELECT * FROM payout_intents WHERE run_id = %s AND status = 'confirmed'
                            ORDER BY confirmed_wall""", (rid,)):
            payouts.setdefault(p["storm_id"], []).append({
                "policy": p["policy_mint"], "kind": p["kind"], "amount": num(p["amount"]), "tx_sig": p["tx_sig"],
                "owner": p["owner"], "gauge_id": p["gauge_id"]})
    return [{"storm_id": s["storm_id"], "status": s["status"], "f_int": num(s["f_int"]), "f_fin": num(s["f_fin"]),
             "opened_at": iso(s["opened_at"]), "closed_at": iso(s["closed_at"]),
             "events": events.get(s["storm_id"], []), "payouts": payouts.get(s["storm_id"], [])}
            for s in db.rows("SELECT * FROM storms WHERE run_id = %s ORDER BY opened_at", (rid,))]


@app.get("/ledger")
def ledger(run_id: str | None = None):
    run = data_run(run_id)
    rid = run["run_id"] if run else "session"
    rows = db.rows("SELECT * FROM ledger WHERE run_id = %s ORDER BY wall_time, entry_id, account", (rid,))
    return {"run_id": rid,
            "rows": [{"wall_time": iso(r["wall_time"]), "entry_id": r["entry_id"], "account": r["account"],
                      "amount": num(r["amount"]), "memo": r["memo"], "tx_sig": r["tx_sig"]} for r in rows],
            "totals": ledger_sums(rid)}


# ---------- admin: replay controls ----------

_streamer: subprocess.Popen | None = None


def _stop_streamer() -> None:
    global _streamer
    replay.stop_thread()
    if _streamer and _streamer.poll() is None:
        _streamer.terminate()
        try:
            _streamer.wait(10)
        except subprocess.TimeoutExpired:
            _streamer.kill()
    _streamer = None


@app.post("/replay/start")
def replay_start(x_admin_token: str | None = Header(default=None)):
    global _streamer
    require_admin(x_admin_token)
    now = dt.datetime.now(dt.timezone.utc).replace(microsecond=0)
    run_id = "run-" + now.strftime("%Y%m%d-%H%M%S")
    bal = chain_balances(fresh=True)
    _stop_streamer()
    db.execute("UPDATE runs SET status = 'done' WHERE status = 'running'")
    db.execute(
        """INSERT INTO runs (run_id, source, started_wall, status, opening_vault, opening_float)
           VALUES (%s, 'replay', %s, 'running', %s, %s)""",
        (run_id, now, bal["vault"] if bal else None, bal["float"] if bal else None))
    if settings.REPLAY_CMD:   # an external streamer instead of the built-in one
        _streamer = subprocess.Popen(shlex.split(settings.REPLAY_CMD), env={**os.environ, "RUN_ID": run_id},
                                     cwd=settings.ROOT)
    else:
        replay.start_thread(run_id)
    return {"run_id": run_id, "opening": {"vault": bal["vault"], "float": bal["float"]} if bal else None,
            "streamer": settings.REPLAY_CMD or "built-in"}


@app.post("/replay/reset")
def replay_reset(x_admin_token: str | None = Header(default=None)):
    require_admin(x_admin_token)
    run = db.one("SELECT * FROM runs WHERE status = 'running' ORDER BY started_wall DESC LIMIT 1") or latest_run()
    if run is None:
        raise HTTPException(409, "No run to reset")
    _stop_streamer()
    db.execute("UPDATE runs SET status = 'reset' WHERE run_id = %s", (run["run_id"],))
    chain, error = None, None
    try:
        r = httpx.post(f"{settings.CHAIN_URL}/chain/reset", json={"run_id": run["run_id"]},
                       headers={"X-Admin-Token": settings.ADMIN_TOKEN}, timeout=180)
        r.raise_for_status()
        chain = r.json()
    except Exception as e:  # report it; the badge goes red until a reset succeeds
        error = str(e)
    ok, detail = reconcile(db.one("SELECT * FROM runs WHERE run_id = %s", (run["run_id"],)), chain_balances(fresh=True))
    return {"run_id": run["run_id"], "chain": chain, "chain_error": error, "reconciled": ok, "reconcile_detail": detail}
