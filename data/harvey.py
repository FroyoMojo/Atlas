"""Decision check 4: the exact Harvey replay window and the gauges that cross trigger_ft in it.
Reads only stored data in Tiger (never the live APIs).

  python data/harvey.py                         # report: crossings, data gaps, suggested demo four
  python data/harvey.py --show-rejected         # readings the jump guard threw out, with neighbours
  python data/harvey.py --demo 08075000 08076000 08069000 08068500 --apply

Window (plan 6.5): from 48 h before the first demo gauge crosses trigger to 24 h after the last
demo gauge peaks. 'Crosses' uses the event-open rule: two consecutive accepted readings at or
above trigger_ft. A gauge with a reading gap longer than GAP_HOURS inside the scan range is marked
GAPPY: its 'crossing' may be an artifact of missing data, so it is not picked by default and
--demo refuses it unless --allow-gaps is given.
"""
from __future__ import annotations

import argparse
import os
from datetime import timedelta

import common
import db

common.load_env()

SCAN_START, SCAN_END = "2017-08-20T00:00:00Z", "2017-09-10T00:00:00Z"
GAP_HOURS = 2
MIN_MARGIN_FT = 2.0  # a demo gauge must clear trigger by this much, or the demo is fragile
PREFERRED = "08075000"  # Brays Bayou at Houston: Meyerland sits on it

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

GAPS = """
SELECT gauge_id, count(*), max(gap) FROM (
  SELECT gauge_id, event_time - lag(event_time) OVER (PARTITION BY gauge_id ORDER BY event_time)
         AS gap
  FROM gauge_readings
  WHERE source = 'usgs' AND run_id = 'live' AND NOT rejected
    AND event_time >= %s AND event_time < %s) t
GROUP BY gauge_id
"""

GAPS_ONE = """
SELECT count(*), max(gap) FROM (
  SELECT event_time - lag(event_time) OVER (ORDER BY event_time) AS gap
  FROM gauge_readings
  WHERE gauge_id = %s AND source = 'usgs' AND run_id = 'live' AND NOT rejected
    AND event_time >= %s AND event_time <= %s) t
"""

REJECTED = """
SELECT gauge_id, event_time, stage_ft, prev_stage, next_stage FROM (
  SELECT gauge_id, event_time, stage_ft, rejected,
         lag(stage_ft) OVER w AS prev_stage, lead(stage_ft) OVER w AS next_stage
  FROM gauge_readings
  WHERE source = 'usgs' AND run_id = 'live' AND event_time >= %s AND event_time < %s
  WINDOW w AS (PARTITION BY gauge_id ORDER BY event_time)) t
WHERE rejected ORDER BY gauge_id, event_time
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
    ap.add_argument("--allow-gaps", action="store_true", help="permit a GAPPY demo gauge")
    ap.add_argument("--show-rejected", action="store_true")
    a = ap.parse_args()
    with db.connect() as conn:
        if a.show_rejected:
            rows = conn.execute(REJECTED, (SCAN_START, SCAN_END)).fetchall()
            print(f"{len(rows)} rejected reading(s) in the scan range")
            for gid, t, st, prev, nxt in rows:
                print(f"{gid} {str(t)[:19]}Z  stage {st}  prev {prev}  next {nxt}")
            print("If these look like a real rapid rise (neighbours on both sides agree with "
                  "the reading), raise --max-jump in backfill and reload.")
            return

        rows = conn.execute(CROSSINGS, (SCAN_START, SCAN_END)).fetchall()
        # Gap check per gauge over its own replay window (opened - 48 h to peak + 24 h), so
        # later outages (after the peak) do not disqualify a gauge.
        gaps = {}
        for gid, _name, _trig, _peak, ptime, opened, _n in rows:
            if opened:
                n, gap = conn.execute(GAPS_ONE, (gid, opened - timedelta(hours=48),
                                                 ptime + timedelta(hours=24))).fetchone()
                gaps[gid] = (n, gap)
        gappy = {g for g, (_n, gap) in gaps.items() if gap and gap > timedelta(hours=GAP_HOURS)}
        print(f"{'gauge':<9} {'trigger':>7} {'peak':>6} {'margin':>6} {'opened (UTC)':<17} "
              f"{'peak time (UTC)':<17} {'n':>5} {'max gap':>8}  name")
        for gid, name, trig, peak, ptime, opened, n in rows:
            gap = gaps.get(gid, (0, None))[1]
            gap_s = f"{gap.total_seconds() / 3600:.1f}h" if gap else "-"
            flags = ("CROSSES" if opened else "no") + (" GAPPY" if gid in gappy else "")
            print(f"{gid:<9} {trig:>7.2f} {peak:>6.2f} {peak - trig:>6.2f} "
                  f"{str(opened)[:16] if opened else '-':<17} {str(ptime)[:16]:<17} {n:>5} "
                  f"{gap_s:>8}  {name} [{flags}]")
        crossing = [r for r in rows if r[5]]
        eligible = [r for r in crossing if r[0] not in gappy and r[3] - r[2] >= MIN_MARGIN_FT]
        print(f"\n{len(crossing)} of {len(rows)} gauges cross trigger; {len(eligible)} also have "
              f"no gap over {GAP_HOURS}h and clear trigger by {MIN_MARGIN_FT} ft (demo-eligible).")
        if len(eligible) < 4:
            print("Fewer than 4 demo-eligible gauges: pick different gauges or revisit trigger_ft.")
        ordered = sorted(eligible, key=lambda r: (r[0] != PREFERRED, r[5]))
        demo = a.demo or [r[0] for r in ordered[:4]]
        by_id = {r[0]: r for r in crossing}
        bad = [d for d in demo if d not in by_id]
        if bad:
            raise SystemExit(f"demo gauges that do not cross: {bad}")
        risky = [d for d in demo if d in gappy or by_id[d][3] - by_id[d][2] < MIN_MARGIN_FT]
        if risky and not a.allow_gaps:
            raise SystemExit(f"demo gauges that are gappy or marginal: {risky} "
                             "(add --allow-gaps to override)")
        d_rows = [by_id[d] for d in demo]
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
            "gappy": sorted(gappy),
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
