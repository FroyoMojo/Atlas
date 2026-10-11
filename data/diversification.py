"""Does backing flood risk in several regions cut the capital a pool needs? (read-only test)

  python data/diversification.py

For candidate USGS gauges outside Houston: annual peak (peak file) vs the NWS moderate flood stage,
over the water years each gauge has a comparable record (after the last USGS datum-change flag).
Then the engine's own capital definition (K = worst complete year - mean, per $ of exposure) for
the Houston-only book versus Houston plus the other regions. Nothing is written anywhere.
"""
import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "engine"))

import build_sim_book as bsb  # noqa: E402
import db  # noqa: E402
import nws  # noqa: E402
import usgs  # noqa: E402
from app import pricing  # noqa: E402

CANDIDATES = {  # USGS site: region label (names are checked at runtime, not trusted)
    "07010000": "Midwest: Mississippi at St. Louis",
    "06934500": "Midwest: Missouri at Hermann",
    "05464500": "Iowa: Cedar River at Cedar Rapids",
    "01570500": "Northeast: Susquehanna at Harrisburg",
    "01463500": "Northeast: Delaware at Trenton",
    "11467000": "California: Russian River nr Guerneville",
    "02296750": "Florida: Peace River at Arcadia",
    "02486000": "Mississippi: Pearl River at Jackson",
    "03049500": "Pennsylvania: Allegheny at Natrona",
    "14174000": "Oregon: Willamette at Albany",
    "06610000": "Nebraska: Missouri at Omaha",
    "02089500": "N. Carolina: Neuse River at Kinston",
}
FIRST_WY, LAST_WY = 2008, 2025


def stage_for(site):
    """Moderate (else minor) NWS flood stage via a small NWPS bbox around the site."""
    meta = usgs.parse_site(usgs.fetch_site(site).text)
    if not meta or meta["lat"] is None:
        return None, None, None
    d = 0.03
    r = nws.fetch_gauges_bbox(meta["lon"] - d, meta["lat"] - d, meta["lon"] + d, meta["lat"] + d)
    if not r.ok:
        return meta, None, None
    hit, how = nws.match(site, meta["lat"], meta["lon"], nws.index_gauges(r.text), max_deg=0.02)
    if not hit:
        return meta, None, None
    st = nws.parse_flood_stages(nws.fetch_gauge(hit["lid"]).text)
    return meta, st, hit


def record_start(rows_text):
    """First water year after the last 'gage datum changed' flag (gage_ht_cd contains 6)."""
    last = 0
    for row in usgs.parse_rdb(rows_text):
        if "6" in (row.get("gage_ht_cd") or "").replace(" ", "").split(","):
            last = max(last, int((row.get("peak_dt") or "0000")[:4] or 0))
    return max(FIRST_WY, last + 1) if last else FIRST_WY


ext = {}   # site -> {year: flag}
for site, label in CANDIDATES.items():
    try:
        meta, st, hit = stage_for(site)
        txt = usgs.fetch_peaks(site).text
        peaks, _ = usgs.parse_peaks(txt)
    except Exception as e:  # noqa: BLE001
        print(f"{site} {label}: skipped ({type(e).__name__})")
        continue
    trig = (st or {}).get("moderate") or (st or {}).get("minor")
    if not meta or not trig:
        print(f"{site} {label}: no NWS flood stage found, skipped")
        continue
    start = record_start(txt)
    by_year = {p.water_year: p.stage_ft for p in peaks if start <= p.water_year <= LAST_WY}
    if len(by_year) < 12:
        print(f"{site} {meta['name'][:34]}: only {len(by_year)} comparable years, skipped")
        continue
    ext[site] = {"name": meta["name"], "trigger": trig, "years": {y: s >= trig for y, s in by_year.items()},
                 "start": start}
    n = sum(ext[site]["years"].values())
    print(f"{site} {meta['name'][:36]:<36} trigger {trig:>6} (moderate)  record {start}-{max(by_year)}  "
          f"{n} exceedances in {len(by_year)} yrs")

# Houston book (the engine's 7-gauge book) as annual loss fractions
conn = db.connect()
gauges, peaks = bsb.load(conn)
events = {g: list(c) for g, c in conn.execute("SELECT gauge_id, iv_counts FROM gauge_rates WHERE gauge_id = ANY(%s)", (list(bsb.BOOK),))}
trig = {g: v["trigger"] for g, v in gauges.items()}
r = bsb.evaluate(gauges, peaks, trig, events)
h_total = r["total_b"]
h_loss = {y: s / h_total for y, s in r["losses"].items()}          # fraction of Houston exposure lost, per year
h_K = r["K"] / h_total

# Common window: years where every external gauge and Houston have data
years = sorted(set(h_loss).intersection(*(set(v["years"]) for v in ext.values()))) if ext else []
print(f"\nHouston-only book: K = {100 * h_K:.0f}% of exposure ({len(h_loss)} complete years, {min(h_loss)}-{max(h_loss)})")
if not ext or len(years) < 8:
    print(f"common window too short ({len(years)} years); using pairwise windows instead")


def regional_fraction(sites, y):
    return sum(ext[s]["years"][y] for s in sites) / len(sites)


def capital(frac_by_year, mean):
    worst = max(frac_by_year.values())
    return max(0.0, worst - mean)


def corr(a, b):
    n = len(a)
    ma, mb = sum(a) / n, sum(b) / n
    sa = math.sqrt(sum((x - ma) ** 2 for x in a)); sb = math.sqrt(sum((x - mb) ** 2 for x in b))
    return sum((x - ma) * (y - mb) for x, y in zip(a, b)) / (sa * sb) if sa and sb else float("nan")


print(f"\ncorrelation of each region's annual 'gauge exceeded' flag with Houston's loss fraction:")
for s, v in ext.items():
    ys = sorted(set(v["years"]) & set(h_loss))
    if len(ys) >= 8:
        print(f"  {s} {v['name'][:34]:<34} years {len(ys)}  corr {corr([h_loss[y] for y in ys], [float(v['years'][y]) for y in ys]):+.2f}")

# Mixed pool: Houston weight w, the other regions equally share (1 - w); same total exposure.
if years:
    others = list(ext)
    print(f"\nMixed pool over {years[0]}-{years[-1]} (n={len(years)}), K and mean as % of exposure")
    print(f"{'Houston share':>13} {'mean loss':>9} {'worst yr':>8} {'K':>6} {'K vs Houston-only':>18}")
    base = None
    for w in (1.0, 0.75, 0.5, 0.25):
        loss = {y: w * h_loss[y] + (1 - w) * regional_fraction(others, y) for y in years}
        mean = sum(loss.values()) / len(loss)
        K = capital(loss, mean)
        base = K if base is None else base
        print(f"{w:>13.2f} {100 * mean:>8.1f}% {100 * max(loss.values()):>7.1f}% {100 * K:>5.1f}% {100 * K / base:>17.0f}%")
    print("\nper-year loss fraction: Houston vs the other regions (average)")
    for y in years:
        print(f"  WY{y}: Houston {100 * h_loss[y]:5.1f}%   others {100 * regional_fraction(others, y):5.1f}%")


# ---------- red-team checks ----------
import random

print("\n=== viability: share of years the moderate stage was reached (a market needs a priceable rate)")
for s, v in ext.items():
    n = len(v["years"]); k = sum(v["years"].values())
    verdict = "TOO FREQUENT (premium ~ payout)" if k / n > 0.35 else "TOO RARE (nothing to price)" if k / n < 0.05 else "viable"
    print(f"  {s} {v['name'][:34]:<34} {k:>2}/{n} = {100 * k / n:4.0f}%   {verdict}")

viable = [s for s, v in ext.items() if 0.05 <= sum(v["years"].values()) / len(v["years"]) <= 0.35]
print(f"\nviable: {len(viable)} of {len(ext)} candidate gauges")


def boot(label, sites, w=0.5, n_draws=5000, seed=11):
    rng = random.Random(seed)
    ys = [y for y in years if all(y in ext[s]["years"] for s in sites)]
    ratios = []
    for _ in range(n_draws):
        sample = [rng.choice(ys) for _ in ys]
        h = [h_loss[y] for y in sample]
        mix = [w * h_loss[y] + (1 - w) * sum(ext[s]["years"][y] for s in sites) / len(sites) for y in sample]
        kh = max(0.0, max(h) - sum(h) / len(h)); km = max(0.0, max(mix) - sum(mix) / len(mix))
        if kh > 0:
            ratios.append(km / kh)
    ratios.sort()
    q = lambda p: ratios[int(p * (len(ratios) - 1))]
    better = sum(1 for r in ratios if r < 1) / len(ratios)
    print(f"  {label:<26} n_years={len(ys)}  K(50/50)/K(Houston-only): median {q(.5):.2f}, 5th {q(.05):.2f}, "
          f"95th {q(.95):.2f}; pool needs LESS capital in {100 * better:.0f}% of resamples")


print("\n=== is the diversification benefit robust? (resample the years, 5,000 draws)")
boot("all candidate regions", list(ext))
boot("viable regions only", viable)
