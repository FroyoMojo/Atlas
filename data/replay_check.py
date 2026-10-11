"""Run the engine's replay streamer once against Tiger with a throwaway run, print what it did, and
delete the run's rows. No chain service involved: opening balances are set directly.

  python data/replay_check.py [seconds]

Checks: which gauges open events, in what order, the storm's f_int and f_fin, the reading count,
and that the sales-freeze alerts are written. Safe to re-run; it removes its own rows.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "engine"))

import db  # noqa: E402

RUN = "run-test-ezeki"
seconds = float(sys.argv[1]) if len(sys.argv) > 1 else 10
conn = db.connect()


def cleanup():
    for t in ("gauge_events", "storms", "replay_alerts", "gauge_readings", "runs"):
        conn.execute(f"DELETE FROM {t} WHERE run_id = %s", (RUN,))


cleanup()
conn.execute("INSERT INTO runs (run_id, source, started_wall, status, opening_vault, opening_float) "
             "VALUES (%s, 'replay', now(), 'running', 5300, 2000)", (RUN,))
from app import replay  # noqa: E402

print("replay:", replay.Replay(RUN, seconds=seconds).run())
print("\nevents (gauge, opened, latched value, closed):")
for e in conn.execute("SELECT g.name, e.opened_at, e.latched_value, e.closed_at, e.storm_id FROM gauge_events e "
                      "JOIN gauges g USING (gauge_id) WHERE e.run_id = %s ORDER BY e.opened_at", (RUN,)):
    print(f"  {e[0][:32]:<32} {str(e[1])[:16]}  {e[2]:>6}  closed {str(e[3])[:16]}  {e[4]}")
print("storms:", conn.execute("SELECT storm_id, status, f_int, f_fin, opened_at, closed_at FROM storms "
                              "WHERE run_id = %s", (RUN,)).fetchall())
n_all, n_rej = conn.execute("SELECT count(*), count(*) FILTER (WHERE rejected) FROM gauge_readings "
                            "WHERE run_id = %s", (RUN,)).fetchone()
print(f"replay readings written: {n_all} ({n_rej} rejected by the guard)")
print("sales-freeze alerts:", conn.execute("SELECT count(*) FROM replay_alerts WHERE run_id = %s", (RUN,)).fetchone()[0])
print("run:", conn.execute("SELECT status, shift, clock FROM runs WHERE run_id = %s", (RUN,)).fetchone())
cleanup()
print("\ncleaned up", RUN)
