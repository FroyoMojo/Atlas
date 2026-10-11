"""List reading gaps longer than 2 h in the Harvey scan range, for the given gauges.

  python data/gaps.py 08073700 08073600 08074810
"""
import sys

import db

c = db.connect()
for g in sys.argv[1:]:
    rows = c.execute(
        "SELECT prev_t, event_time, event_time - prev_t FROM ("
        " SELECT event_time, lag(event_time) OVER (ORDER BY event_time) AS prev_t FROM gauge_readings"
        " WHERE gauge_id = %s AND source = 'usgs' AND run_id = 'live' AND NOT rejected"
        " AND event_time >= '2017-08-20' AND event_time < '2017-09-10') t "
        "WHERE event_time - prev_t > interval '2 hours' ORDER BY 1", (g,)).fetchall()
    print(g, "gaps over 2 h:", [(str(a)[5:16], str(b)[5:16], str(d)) for a, b, d in rows] or "none")
