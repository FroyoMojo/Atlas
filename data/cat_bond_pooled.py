"""Does pooling markets make the investor layer a real cat bond? Read-only.

  python data/cat_bond_pooled.py

Houston (the 2,000-policy book, as annual loss fractions) plus the six A/B graded candidate markets,
each given equal exposure. Years of different regions are drawn independently (an assumption: it
ignores shared climate swings like El Nino, so it is the best case for pooling). For a layer that
attaches at a given share of total exposure and exhausts at 90%, prints the expected annual loss, the
chance of any loss and the coupon a market would ask (risk-free 4% + 3x EL).
"""
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "engine"))

import build_sim_book as bsb  # noqa: E402
import db  # noqa: E402
import nws  # noqa: E402
import usgs  # noqa: E402

SITES = {"02089500": "Neuse, NC", "02296750": "Peace, FL", "02486000": "Pearl, MS", "06610000": "Missouri at Omaha, NE",
         "01463500": "Delaware at Trenton", "01570500": "Susquehanna at Harrisburg"}
FIRST_WY, LAST_WY = 2008, 2025
RF, N_SIM = 0.04, 100_000


def stage_for(site):
    meta = usgs.parse_site(usgs.fetch_site(site).text)
    d = 0.03
    r = nws.fetch_gauges_bbox(meta["lon"] - d, meta["lat"] - d, meta["lon"] + d, meta["lat"] + d)
    hit, _ = nws.match(site, meta["lat"], meta["lon"], nws.index_gauges(r.text), max_deg=0.02)
    return nws.parse_flood_stages(nws.fetch_gauge(hit["lid"]).text), meta


def record_start(text):
    last = 0
    for row in usgs.parse_rdb(text):
        if "6" in (row.get("gage_ht_cd") or "").replace(" ", "").split(","):
            last = max(last, int((row.get("peak_dt") or "0000")[:4] or 0))
    return max(FIRST_WY, last + 1) if last else FIRST_WY


regions: dict[str, list[float]] = {}   # name -> annual loss fraction series
for site, label in SITES.items():
    try:
        st, meta = stage_for(site)
        txt = usgs.fetch_peaks(site).text
        peaks, _ = usgs.parse_peaks(txt)
        trig = st.get("moderate") or st.get("minor")
        start = record_start(txt)
        series = [1.0 if p.stage_ft >= trig else 0.0 for p in peaks if start <= p.water_year <= LAST_WY]
        regions[label] = series
        print(f"{label:<28} trigger {trig}  {len(series)} yrs  {int(sum(series))} exceedances")
    except Exception as e:  # noqa: BLE001
        print(f"{label}: skipped ({type(e).__name__})")

conn = db.connect()
gauges, peaks = bsb.load(conn)
events = {g: list(c) for g, c in conn.execute("SELECT gauge_id, iv_counts FROM gauge_rates WHERE gauge_id = ANY(%s)", (list(bsb.BOOK),))}
r = bsb.evaluate(gauges, peaks, {g: v["trigger"] for g, v in gauges.items()}, events)
rows = bsb.make_rows()
exposure: dict[str, float] = {}
for g, b in rows:
    exposure[g] = exposure.get(g, 0.0) + b
total = r["total_b"]
houston = []
for y in sorted({y for by in peaks.values() for y in by}):
    avail = [g for g in exposure if y in peaks.get(g, {})]
    if len(avail) >= 4:
        have = sum(exposure[g] for g in avail)
        houston.append(sum(exposure[g] for g in avail if peaks[g][y] >= gauges[g]["trigger"]) / have)
houston_mean = sum(houston) / len(houston)
print(f"\nHouston: {len(houston)} yrs, mean loss {100 * houston_mean:.0f}% of exposure, worst {100 * max(houston):.0f}%")

ordered = [("Houston", houston)] + list(regions.items())
rng = random.Random(5)


def pooled_sample(n_regions: int) -> list[float]:
    pick = ordered[:n_regions]
    return [sum(rng.choice(s) for _, s in pick) / n_regions for _ in range(N_SIM)]


EXH = 0.90
print(f"\nLayer from 'attach' to {int(100 * EXH)}% of exposure. EL is per year, as a share of the layer.")
print(f"{'regions':>8} {'mean loss':>10} {'attach':>7} {'EL/yr':>7} {'P(loss)':>8} {'P(exhaust)':>11} {'coupon @3x EL':>14}")
for n in (1, 3, 5, 7):
    if n > len(ordered):
        continue
    sample = pooled_sample(n)
    mean = sum(sample) / len(sample)
    for attach in (0.30, 0.40, 0.50):
        w = EXH - attach
        lost = [min(max(s - attach, 0.0), w) / w for s in sample]
        el = sum(lost) / len(lost)
        print(f"{n:>8} {100 * mean:9.1f}% {100 * attach:6.0f}% {100 * el:6.2f}% {100 * sum(x > 0 for x in lost) / len(lost):7.1f}% "
              f"{100 * sum(x >= 0.999 for x in lost) / len(lost):10.2f}% {100 * (RF + 3 * el):13.1f}%")
