"""Decision check 4: the exact Harvey replay window and the gauges that cross trigger_ft in it.
Reads only stored data in Tiger (never the live APIs).

  python data/harvey.py                    # report only
  python data/harvey.py --demo 08075000 08074500 08074000 08076000 --apply

Window (plan 6.5): from 48 h before the first demo gauge crosses trigger to 24 h after the last
demo gauge peaks. 'Crosses' uses the event-open rule: two consecutive accepted readings at or
above trigger_ft. REPLAY_SECONDS / readings gives the seconds per reading.
"""
from __future__ import annotations

import argparse
import os
from datetime import timedelta

import common
import db

common.load_env()

SCAN_START, SCAN_END = "2017-08-20T00:00:00Z", "2017-09-10T00:00:00Z"

CROSSINGS = """
WITH r AS (
  SELECT g.gauge_id, g.name, g.trigger_ft, x.event_time, x.stage_ft,
         lag(x.stage_ft) OVER w AS prev_stage
  FROM gauges g JOIN gauge_readings x USING (gauge_id)
  WHERE x.source = 'usgs' AND x.run_id = 'live' AND NOT x.rejected
    AND x.event_time >= %s AND x.event_time < %s
  WINDOW w AS (PARTITION BY g.gauge_id ORDER BY x.event_time)
)
SELECT gauge_id, name, trigger_ft, max(stage_ft) AS peak_ft,
       (array_agg(event_time ORDER BY stage_ft DESC))[1] AS peak_time,
       min(event_time) FILTER (WHERE stage_ft >= trigger_ft AND prev_stage >= trigger_ft)
         AS opened_at,
       count(*) AS n
FROM r GROUP BY gauge_id, name, trigger_ft
ORDER BY opened_at NULLS LAST, gauge_id
"""

COUNT_IN_WINDOW = """
SELECT gauge_id, count(*) FROM gauge_readings
WHERE source='usgs' AND run_id='live' AND NOT rejected AND gauge_id = ANY(%s)
  AND event_time >= %s AND event_time <= %s GROUP BY gauge_id ORDER BY gauge_id
"""


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    ap.add_argument("--demo", nargs="*", help="four gauge ids to mark demo_ready")
    ap.add_argument("--apply", action="store_true", help="write demo_ready to gauges")
    a = ap.parse_args()
    with db.connect() as conn:
        rows = conn.execute(CROSSINGS, (SCAN_START, SCAN_END)).fetchall()
        print(f"{'gauge':<10} {'trigger':>8} {'peak':>7} {'margin':>7} {'opened (UTC)':<22} "
              f"{'peak time (UTC)':<22} n   name")
        for gid, name, trig, peak, ptime, opened, n in rows:
            mark = "CROSSES" if opened else "no"
            print(f"{gid:<10} {trig:>8.2f} {peak:>7.2f} {peak - trig:>7.2f} "
                  f"{str(opened)[:19] if opened else '-':<22} {str(ptime)[:19]:<22} {n:<4}{name} "
                  f"[{mark}]")
        crossing = [r for r in rows if r[5]]
        print(f"\n{len(crossing)} of {len(rows)} gauges cross trigger in the scan range.")
        if len(crossing) < 4:
            print("Fewer than 4 crossings: pick different gauges or revisit trigger_ft (plan 6.1).")
        demo = a.demo or [r[0] for r in crossing[:4]]
        d_rows = [r for r in crossing if r[0] in demo]
        if len(d_rows) < len(demo):
            raise SystemExit(f"demo gauges that do not cross: {set(demo) - {r[0] for r in d_rows}}")
        start = min(r[5] for r in d_rows) - timedelta(hours=48)
        end = max(r[4] for r in d_rows) + timedelta(hours=24)
        counts = dict(conn.execute(COUNT_IN_WINDOW, (demo, start, end)).fetchall())
        replay_s = int(os.environ.get("REPLAY_SECONDS", "90"))
        per = max(counts.values()) if counts else 0
        print(f"\nDemo gauges: {demo}")
        print(f"Replay window: {start:%Y-%m-%d %H:%M}Z to {end:%Y-%m-%d %H:%M}Z "
              f"({(end - start).total_seconds() / 86400:.1f} days)")
        print(f"Readings per gauge in window: {counts}  (plan expects roughly 480 to 580)")
        if per:
            print(f"Seconds per reading at REPLAY_SECONDS={replay_s}: {replay_s / per:.3f}")
        path = common.write_report("harvey_window.json", {
            "demo_gauges": demo, "window_start": start, "window_end": end,
            "readings_per_gauge": counts, "replay_seconds": replay_s,
            "crossings": [{"gauge": r[0], "trigger_ft": r[2], "peak_ft": r[3],
                           "opened_at": r[5]} for r in crossing]})
        print("Report:", path)
        if a.apply:
            conn.execute("UPDATE gauges SET demo_ready = false")
            conn.execute("UPDATE gauges SET demo_ready = true WHERE gauge_id = ANY(%s)", (demo,))
            print("demo_ready set for", demo)
        else:
            print("Dry run. Add --apply to set demo_ready.")


if __name__ == "__main__":
    main()
