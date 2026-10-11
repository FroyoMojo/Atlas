"""Premium sensitivity: what does a $500 policy cost at each trigger level and term length?

  python data/premium_scan.py

For every gauge in the preflight report: comparable-record annual peaks (record start from
f11_decisions.json, or the datum flag year + 1 for gauges not yet decided), exceedance counts at
each NWS flood category, the Harvey stage, and the premium (E[L](1+theta), no capital charge)
for 365, 90 and 30 day terms. Read-only; nothing is written to Tiger.
"""
import json
import math

import common
import usgs

THETA = 0.35
PAYOUT = 500.0
EXTRA_START = {"08073600": 2010, "08073700": 2010, "08074810": 2007, "08075110": 2007,
               "08074760": 2007}  # datum flag year + 1 (peakcodes, Oct 10)

rep = json.loads((common.REPORT_DIR / "preflight_report.json").read_text())
dec = json.loads((common.DATA_DIR / "f11_decisions.json").read_text())["decisions"]
names = {g["site"]: (g.get("site_meta") or {}).get("name", "")[:34] for g in rep["gauges"]}


def prem(lam: float, days: int) -> float:
    return PAYOUT * (1 - math.exp(-lam * days / 365)) * (1 + THETA)


print(f"{'gauge':<9} {'name':<34} {'yrs':>3} {'cat':<8} {'stage':>6} {'exc':>3} {'harvey-margin':>13} "
      f"{'$365d':>6} {'$90d':>5} {'$30d':>5}")
for g in rep["gauges"]:
    site = g["site"]
    st = rep["nws"]["stages"].get(site)
    if not st:
        continue
    start = dec.get(site, {}).get("record_start") or EXTRA_START.get(site)
    if start is None:
        continue
    peaks, _ = usgs.parse_peaks(usgs.fetch_peaks(site, offline=True).text)
    comp = [p for p in peaks if p.water_year >= start]
    harvey = max((p.stage_ft for p in comp if p.water_year == 2017), default=None)
    for cat in ("action", "minor", "moderate", "major"):
        trig = st.get(cat)
        if trig is None:
            continue
        n = sum(p.stage_ft >= trig for p in comp)
        lam = n / len(comp)
        margin = f"{harvey - trig:+.2f}" if harvey is not None else "-"
        print(f"{site:<9} {names[site]:<34} {len(comp):>3} {cat:<8} {trig:>6} {n:>3} {margin:>13} "
              f"{prem(lam, 365):>6.0f} {prem(lam, 90):>5.0f} {prem(lam, 30):>5.0f}")
    print()
