"""Compare each gauge's annual peak (USGS peak file) with the maximum of its instantaneous stage
for the same water year. They should agree; where they do not, one series is not comparable.

  python data/peak_vs_iv.py 08073700 08074810 08075500
"""
import sys

import db

c = db.connect()
for g in sys.argv[1:]:
    trig, rs = c.execute("SELECT trigger_ft, record_start FROM gauges WHERE gauge_id = %s", (g,)).fetchone()
    rows = c.execute(
        "SELECT p.water_year, p.peak_stage_ft, h.m FROM annual_peaks p LEFT JOIN ("
        " SELECT CASE WHEN extract(month FROM bucket) >= 10 THEN extract(year FROM bucket) + 1 "
        "  ELSE extract(year FROM bucket) END::int AS wy, max(max_stage) AS m "
        " FROM gauge_hourly WHERE gauge_id = %s AND source = 'usgs' AND run_id = 'live' GROUP BY 1) h "
        "ON h.wy = p.water_year WHERE p.gauge_id = %s AND p.water_year >= 2008 ORDER BY 1", (g, g)).fetchall()
    print(f"\n{g} trigger {trig} record_start {rs}\n  wy   peak_file   iv_max   diff")
    for wy, pk, iv in rows:
        flag = "  <-- peak file above trigger, iv below" if pk and iv and pk >= trig > iv else ""
        print(f"  {wy}  {pk if pk is not None else '-':>9}  {round(iv, 2) if iv is not None else '-':>7}  "
              f"{round(pk - iv, 2) if pk is not None and iv is not None else '-':>6}{flag}")
