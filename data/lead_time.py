"""Anticipatory payout feasibility: how much warning does the gauge itself give?

  python data/lead_time.py

For each demo gauge: an "alert episode" starts when the stage first reaches the NWS ACTION stage
(readings less than 1 h apart belong to one episode). It is "converted" if the episode goes on to
reach the policy trigger (NWS moderate) on two consecutive readings. Reports, over the whole
instantaneous record since the gauge's comparable-record start:
  episodes        how often the action stage is reached
  converted       how many of those become a real trigger event
  false alarms    episodes that never reach the trigger
  lead time       hours from the action-stage crossing to the trigger opening, for converted ones
Read-only.
"""
import datetime as dt
import json
import statistics

import common
import db

DEMO = ["08075000", "08073700", "08069000", "08068500"]
stages = json.loads((common.REPORT_DIR / "preflight_report.json").read_text())["nws"]["stages"]
conn = db.connect()
print(f"{'gauge':<9} {'name':<30} {'action':>6} {'trig':>5} {'episodes':>8} {'conv':>4} {'false':>5} "
      f"{'lead min':>8} {'median':>7} {'max':>6}  lead times (h)")
for g in DEMO:
    name, trig, rs = conn.execute("SELECT name, trigger_ft, record_start FROM gauges WHERE gauge_id = %s", (g,)).fetchone()
    action = stages[g]["action"]
    t0 = dt.datetime(max(rs, 2008) - 1, 10, 1, tzinfo=dt.timezone.utc)
    rows = conn.execute(
        "SELECT event_time, stage_ft FROM gauge_readings WHERE gauge_id = %s AND source = 'usgs' "
        "AND run_id = 'live' AND NOT rejected AND event_time >= %s AND stage_ft >= %s ORDER BY event_time",
        (g, t0, action)).fetchall()
    episodes, cur = [], []
    for t, s in rows:
        if cur and t - cur[-1][0] > dt.timedelta(hours=1):
            episodes.append(cur)
            cur = []
        cur.append((t, s))
    if cur:
        episodes.append(cur)
    leads = []
    for ep in episodes:
        opened = next((ep[i][0] for i in range(1, len(ep))
                       if ep[i][1] >= trig and ep[i - 1][1] >= trig), None)
        if opened:
            leads.append((opened - ep[0][0]).total_seconds() / 3600)
    n, c = len(episodes), len(leads)
    lead_txt = ", ".join(f"{x:.1f}" for x in sorted(leads))
    print(f"{g:<9} {name[:30]:<30} {action:>6} {trig:>5} {n:>8} {c:>4} {n - c:>5} "
          f"{(min(leads) if leads else 0):>8.1f} {(statistics.median(leads) if leads else 0):>7.1f} "
          f"{(max(leads) if leads else 0):>6.1f}  {lead_txt}")
