#!/usr/bin/env python3
"""Minimal insert script for Gate G2 (plan v3.1 [F17]) and the true-up rehearsal [V8].

Opens a run, a storm and gauge events directly in Tiger with the canonical evidence preimage
(docs/evidence.md), so the payout bot pays real devnet policies before the full replay exists.
The engine replaces this once its streamer and storm logic are live.

  pip install "psycopg[binary]"
  export DATABASE_URL=postgres://...  CHAIN_URL=http://127.0.0.1:8787
  python3 tools/g2_storm.py open  --run g2-1 --f-int 1.0 --event GAUGE_ID:41.37 [--event GAUGE_ID:31.2]
  python3 tools/g2_storm.py close --storm g2-1-s1 --f-fin 1.0     # true-up (if f_fin > f_int)
  python3 tools/g2_storm.py done  --run g2-1                       # mark the run finished

True-up rehearsal: open with --f-int 0.6, wait for the interim payouts, then close with --f-fin 1.0.
"""
import argparse
import datetime as dt
import hashlib
import json
import os
import sys
import urllib.request

import psycopg


def preimage(gauge_id, value, opened_at, run_id, storm_id, event_id, feed=None, slot=None):
    t = opened_at.astimezone(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return "|".join(["atlas", "v3", gauge_id, f"{value:.2f}", t, run_id, storm_id, event_id,
                     feed or "-", str(slot) if slot is not None else "-"])


def self_test():
    p = preimage("08074500", 31.456, dt.datetime(2026, 10, 11, 3, 15, 0, 250000, tzinfo=dt.timezone.utc),
                 "run-7", "run-7-s1", "run-7-e3")
    h = hashlib.sha256(p.encode("utf-8")).hexdigest()
    assert h == "a3bf1d54bf92482a546d48927da5801cc8452da55dee080956c8ce7222bf3642", (p, h)


def opening_balances():
    url = os.environ.get("CHAIN_URL", "http://127.0.0.1:8787") + "/chain/balances"
    try:
        with urllib.request.urlopen(url, timeout=5) as r:
            b = json.load(r)
            return b["vault"], b["float"]
    except Exception as e:  # reconciliation will flag a missing opening balance
        print(f"warning: could not read {url}: {e}", file=sys.stderr)
        return None, None


def cmd_open(cur, a):
    now = dt.datetime.now(dt.timezone.utc).replace(microsecond=0)
    vault, flt = opening_balances()
    # Mark an abandoned run reset (not done): a done run's open storm would stay payable.
    cur.execute("UPDATE runs SET status = 'reset', reset_wall = now() WHERE status = 'running'")
    cur.execute(
        "INSERT INTO runs (run_id, source, started_wall, shift, clock, status, opening_vault, opening_float) "
        "VALUES (%s, 'replay', %s, interval '0', %s, 'running', %s, %s)",
        (a.run, now, now, vault, flt))
    storm = f"{a.run}-s1"
    cur.execute("INSERT INTO storms (storm_id, run_id, opened_at, f_int, status) VALUES (%s, %s, %s, %s, 'open')",
                (storm, a.run, now, a.f_int))
    for n, spec in enumerate(a.event, 1):
        gauge, value = spec.rsplit(":", 1)
        value = float(value)
        event = f"{a.run}-e{n}"
        p = preimage(gauge, value, now, a.run, storm, event)
        cur.execute(
            "INSERT INTO gauge_events (event_id, run_id, storm_id, gauge_id, opened_at, latched_value, preimage, evidence_hash) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
            (event, a.run, storm, gauge, now, value, p, hashlib.sha256(p.encode("utf-8")).hexdigest()))
        print(f"event {event}: {p}")
    print(f"opened run {a.run}, storm {storm}, f_int {a.f_int}; opening vault {vault}, float {flt}")


def cmd_close(cur, a):
    cur.execute("UPDATE gauge_events SET closed_at = now() WHERE storm_id = %s AND closed_at IS NULL", (a.storm,))
    cur.execute("UPDATE storms SET status = 'closed', closed_at = now(), f_fin = %s WHERE storm_id = %s AND status = 'open'",
                (a.f_fin, a.storm))
    if cur.rowcount == 0:
        sys.exit(f"no open storm {a.storm}")
    print(f"closed storm {a.storm} with f_fin {a.f_fin}")


def cmd_done(cur, a):
    cur.execute("UPDATE runs SET status = 'done' WHERE run_id = %s", (a.run,))
    print(f"run {a.run} done")


def main():
    self_test()
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    o = sub.add_parser("open")
    o.add_argument("--run", required=True)
    o.add_argument("--f-int", type=float, default=1.0)
    o.add_argument("--event", action="append", required=True, help="GAUGE_ID:VALUE_FT, repeatable")
    c = sub.add_parser("close")
    c.add_argument("--storm", required=True)
    c.add_argument("--f-fin", type=float, default=1.0)
    d = sub.add_parser("done")
    d.add_argument("--run", required=True)
    a = ap.parse_args()
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn, conn.cursor() as cur:
        {"open": cmd_open, "close": cmd_close, "done": cmd_done}[a.cmd](cur, a)


if __name__ == "__main__":
    main()
