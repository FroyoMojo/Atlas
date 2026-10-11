"""Facts for the product brainstorm (read-only): how long do the demo gauges stay above their
trigger, and what does NWS say floods at each stage?"""
import datetime as dt
import json
import statistics

import common
import db
import nws

DEMO = ["08075000", "08073700", "08069000", "08068500"]
conn = db.connect()
print("=== hours at or above the policy trigger, per event (events = 72 h clusters), whole record")
for g in DEMO:
    name, trig, rs = conn.execute("SELECT name, trigger_ft, record_start FROM gauges WHERE gauge_id = %s", (g,)).fetchone()
    t0 = dt.datetime(max(rs, 2008) - 1, 10, 1, tzinfo=dt.timezone.utc)
    rows = conn.execute(
        "SELECT event_time, stage_ft FROM gauge_readings WHERE gauge_id = %s AND source = 'usgs' AND run_id = 'live' "
        "AND NOT rejected AND event_time >= %s AND stage_ft >= %s ORDER BY event_time", (g, t0, trig)).fetchall()
    events, cur = [], []
    for t, s in rows:
        if cur and t - cur[-1][0] > dt.timedelta(hours=72):
            events.append(cur); cur = []
        cur.append((t, s))
    if cur:
        events.append(cur)
    out = []
    for ev in events:
        hrs = sum(min((b[0] - a[0]).total_seconds(), 3600) for a, b in zip(ev, ev[1:])) / 3600  # skip data gaps
        out.append((ev[0][0].strftime("%Y-%m"), round(hrs, 1), max(s for _, s in ev)))
    print(f"{g} {name[:30]:<30} trigger {trig}: " + "; ".join(f"{d} {h}h peak {p}" for d, h, p in out))
    if out:
        print(f"    median {statistics.median(h for _, h, _ in out)} h, max {max(h for _, h, _ in out)} h over {len(out)} events")

print("\n=== NWS impact statements (flood.impacts) for the demo gauges")
w, s, e, n = (float(x) for x in "-95.90,29.45,-94.95,30.20".split(","))
index = nws.index_gauges(nws.fetch_gauges_bbox(w, s, e, n).text)
for g in DEMO:
    lat, lon = conn.execute("SELECT lat, lon FROM gauges WHERE gauge_id = %s", (g,)).fetchone()
    hit, _ = nws.match(g, lat, lon, index)
    doc = json.loads(nws.fetch_gauge(hit["lid"]).text)
    imp = (doc.get("flood") or {}).get("impacts") or []
    print(f"{g} {hit['lid']} {hit['name']}: {len(imp)} impact statements")
    for i in sorted(imp, key=lambda x: x.get("stage", 0))[:12]:
        print(f"    {i.get('stage')} ft: {str(i.get('statement'))[:150]}")
