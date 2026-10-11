"""Set trigger_ft to an NWS flood category for every gauge that has one (default: moderate).

  python data/set_triggers.py [minor|moderate|major]

nws_flood_ft keeps the NWS minor flood stage. Gauges with no NWS stages (Hunting, Halls) keep their
percentile fallback and are not priced. Re-run `event_rate.py --store` afterwards so the yearly
event counts match the new triggers.
"""
import json
import sys

import common
import db

scheme = sys.argv[1] if len(sys.argv) > 1 else "moderate"
assert scheme in ("minor", "moderate", "major")
stages = json.loads((common.REPORT_DIR / "preflight_report.json").read_text())["nws"]["stages"]
conn = db.connect()
for g, st in stages.items():
    if not st or st.get(scheme) is None:
        continue
    cur = conn.execute(
        "UPDATE gauges SET trigger_ft = %s, "
        "record_note = regexp_replace(COALESCE(record_note, ''), ' [|] TRIGGER = .*$', '') || %s WHERE gauge_id = %s",
        (st[scheme], f" | TRIGGER = NWS {scheme} flood stage ({st[scheme]} ft), set Oct 10 (premium scan).", g))
    if cur.rowcount:
        print(f"{g}: trigger_ft {st[scheme]} (NWS {scheme})")
