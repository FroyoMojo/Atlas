"""Can the investor layer be a real catastrophe bond? Read-only.

  python data/cat_bond_design.py

A cat bond is priced as a spread over the risk-free rate, and the spread is a multiple of the layer's
expected loss (EL). The market pays roughly 2 to 3 times EL, and most issues sit at an EL of 1 to 5%.
This script measures the EL of the layer our engine calls "bond" (it attaches at the premium reserve
and exhausts at reserve + K), then of higher attachment points, on two loss series for the 2,000-policy
book: the 10 complete years (WY2015 to WY2024) and a longer series that scales the gauges available in
each year up to the whole book (WY2008 and later). Also prints what the coupon does to a Brays price.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "engine"))

import build_sim_book as bsb  # noqa: E402
import db  # noqa: E402
from app import pricing, settings  # noqa: E402

RF = 0.04  # risk-free rate a collateralized bond also earns (the trust invests the proceeds in T-bills)
conn = db.connect()
gauges, peaks = bsb.load(conn)
trig = {g: v["trigger"] for g, v in gauges.items()}
events = {g: list(c) for g, c in conn.execute(
    "SELECT gauge_id, iv_counts FROM gauge_rates WHERE gauge_id = ANY(%s)", (list(bsb.BOOK),))}
r = bsb.evaluate(gauges, peaks, trig, events)
K, R, total = r["K"], r["reserve"], r["total_b"]
complete = r["losses"]

# Longer series: in each year use the gauges that have a comparable peak, scale to the whole book.
rows = bsb.make_rows()
exposure: dict[str, float] = {}
for g, b in rows:
    exposure[g] = exposure.get(g, 0.0) + b
longer: dict[int, float] = {}
for y in sorted({y for by in peaks.values() for y in by}):
    avail = [g for g in exposure if y in peaks.get(g, {})]
    if len(avail) < 4:
        continue
    have = sum(exposure[g] for g in avail)
    hit = sum(exposure[g] for g in avail if peaks[g][y] >= trig[g])
    longer[y] = total * hit / have


def layer(series: dict[int, float], attach: float, exhaust: float):
    width = exhaust - attach
    lost = [min(max(s - attach, 0.0), width) / width for s in series.values()]
    n = len(lost)
    return sum(lost) / n, sum(1 for x in lost if x > 0) / n, sum(1 for x in lost if x >= 0.999) / n


def show(name: str, series: dict[int, float]):
    print(f"\n--- {name}: {len(series)} years {min(series)}-{max(series)}, mean loss ${sum(series.values()) / len(series):,.0f}, "
          f"worst ${max(series.values()):,.0f}, exposure ${total:,.0f}")
    print("    years: " + "  ".join(f"{y}:{s / 1000:,.0f}k" for y, s in series.items()))
    exhaust = R + K
    print(f"    {'attach':>9} {'exhaust':>9} {'principal':>10} {'EL/yr':>7} {'P(any loss)':>12} {'P(total)':>9} "
          f"{'spread @2x':>11} {'@3x':>6} {'coupon @3x':>11}")
    for label, a in [("reserve (today)", R), ("400k", 400_000), ("550k", 550_000), ("700k", 700_000), ("800k", 800_000)]:
        if a >= exhaust:
            continue
        el, p_any, p_all = layer(series, a, exhaust)
        print(f"    {label:>15} {exhaust:>9,.0f} {exhaust - a:>10,.0f} {100 * el:6.1f}% {100 * p_any:11.0f}% {100 * p_all:8.0f}% "
              f"{100 * 2 * el:10.1f}% {100 * 3 * el:5.1f}% {100 * (RF + 3 * el):10.1f}%")


print(f"book: exposure ${total:,.0f}; K ${K:,.0f}; premium reserve R ${R:,.0f}; the bond layer is ${R:,.0f} to ${R + K:,.0f}")
show("complete years", complete)
show("longer series (scaled)", longer)


# ---- Reserve dynamics: a 3-year bond is a stop-loss on a reserve that keeps collecting premiums.
import random  # noqa: E402

P_YEAR = sum(p.premium for p in r["book"]) * (1 - settings.EXPENSE_RATIO)   # premiums into the reserve per year
TERM, PATHS, BLOCK = 3, 20_000, 3


def simulate(series: dict[int, float], r0: float, principal: float, c: float, seed: int = 7):
    ys = [series[y] for y in sorted(series)]
    rng = random.Random(seed)
    lost_frac, any_loss, hh_short = [], 0, 0
    for _ in range(PATHS):
        # block bootstrap keeps consecutive wet years together (2015 to 2017 happened back to back)
        path: list[float] = []
        while len(path) < TERM:
            i = rng.randrange(len(ys))
            path += [ys[(i + k) % len(ys)] for k in range(BLOCK)]
        reserve, bond = r0, principal
        for s in path[:TERM]:
            reserve += P_YEAR - c * principal                # premiums in, coupon out
            pay = min(s, max(reserve, 0.0))
            reserve -= pay
            gap = s - pay
            from_bond = min(gap, bond)
            bond -= from_bond
            if gap - from_bond > 1e-6:
                hh_short += 1
                break
        lost = 1 - bond / principal
        lost_frac.append(lost)
        any_loss += lost > 1e-9
    n = len(lost_frac)
    return sum(lost_frac) / n, any_loss / n, hh_short / n


print(f"\n--- Reserve dynamics (3-year bond, premiums of ${P_YEAR:,.0f} a year keep flowing into the reserve; "
      f"block-bootstrapped years from the longer series)")
for r0 in (200_000, 400_000):
    print(f"  Starting reserve ${r0:,.0f}")
    print(f"    {'principal':>10} {'term loss':>10} {'EL/yr':>7} {'P(any loss)':>12} {'households short':>17} {'coupon @3x EL':>14} {'extra on Brays':>15}")
    for principal in (100_000, 200_000, 400_000, 669_000):
        c = 0.06
        for _ in range(4):       # coupon depends on EL, EL depends on coupon (it drains the reserve): iterate
            tl, pa, hh = simulate(longer, r0, principal, c)
            c = RF + 3 * (tl / TERM)
        brays = pricing.k_share(principal, 500.0, total) * c * 90 / 365   # capital term per Brays $500 policy
        print(f"    {principal:>10,.0f} {100 * tl:9.1f}% {100 * tl / TERM:6.1f}% {100 * pa:11.0f}% {100 * hh:16.1f}% "
              f"{100 * c:13.1f}% {brays:9.2f} vs 5.21")

print("\n--- What the coupon does to a Brays $500 / 90 day price (rest of the model unchanged)")
k_b = pricing.k_share(K, 500.0, total)
for c in (0.06, 0.12, 0.20, 0.30):
    p = pricing.premium(500.0, r["rate"]["08075000"], 90 / 365, settings.THETA, c, k_b, minimum=settings.MIN_PREMIUM)
    print(f"    coupon c = {100 * c:4.0f}% -> premium ${p:6.2f}   (capital term ${c * k_b * 90 / 365:5.2f} of it)")
