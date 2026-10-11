"""Flood Chest backtest: a community pool that members fund themselves, seeded by sponsors.

  python data/chest_sim.py

For each demo gauge, replay the actual annual flood record (annual peak at or above the policy
trigger) against a chest of N members. Each year members contribute; if the gauge triggered,
members are paid up to B each, pro rata if the chest is short. Compared with the insurance model
the same members would have paid (premium per year from the engine's formula).
  contribution  build phase: 1.25 x expected annual loss; after the chest reaches its target
                (B x N): 1.0 x expected annual loss (no risk load, no capital charge)
  seed          sponsor money put in at the start (a share of the target), recovered from any chest
                balance above the target
Read-only; uses the stored peaks and rates.
"""
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "engine"))

import db  # noqa: E402
from app import pricing, settings  # noqa: E402

B, N = 500.0, 1000
DEMO = {"08075000": "Brays", "08073700": "Piney Point", "08069000": "Cypress", "08068500": "Spring Ck"}
conn = db.connect()


def run(flags, start, seed_share, yield_rate, el, premium_year):
    """flags: {year: triggered}. Returns per-run metrics for a chest started at `start`."""
    target = B * N
    pool, seed_out = seed_share * target, seed_share * target
    paid_total = need_total = 0.0
    contributed = 0.0
    full_years = flood_years = 0
    for y in sorted(k for k in flags if k >= start):
        c_year = (1.0 if pool >= target else 1.25) * el
        pool += yield_rate * pool + N * c_year
        contributed += N * c_year
        if flags[y]:
            need = N * B
            paid = min(need, pool)
            pool -= paid
            paid_total += paid
            need_total += need
            flood_years += 1
            full_years += paid >= need - 1e-6
        if pool > target and seed_out > 0:     # repay the seed from any balance above the target
            back = min(seed_out, pool - target)
            pool -= back
            seed_out -= back
    n_years = len([k for k in flags if k >= start])
    return {"years": n_years, "flood_years": flood_years, "full": full_years,
            "paid_ratio": (paid_total / need_total) if need_total else None,
            "pool_end": pool / target, "seed_out": seed_out / target,
            "household_cost": contributed / N / n_years, "insurance": premium_year}


print(f"chest of {N} members, payout ${B:.0f} each, target ${B * N:,.0f}; seed = share of target put in by sponsors")
for g, label in DEMO.items():
    trig, rs = conn.execute("SELECT trigger_ft, record_start FROM gauges WHERE gauge_id = %s", (g,)).fetchone()
    peaks = {wy: st for wy, st in conn.execute(
        "SELECT water_year, peak_stage_ft FROM annual_peaks WHERE gauge_id = %s AND peak_stage_ft IS NOT NULL "
        "AND water_year >= %s", (g, rs))}
    flags = {y: s >= trig for y, s in peaks.items()}
    counts = [r[0] for r in conn.execute("SELECT iv_counts FROM gauge_rates WHERE gauge_id = %s", (g,))]
    lam = pricing.rate_higher_of(list(flags.values()), list(counts[0]) if counts else None)
    el = B * (1 - math.exp(-lam))                        # expected annual loss per member
    prem_year = pricing.premium(B, lam, 1.0, settings.THETA, settings.COST_OF_CAPITAL, 0.0)
    years = sorted(flags)
    print(f"\n=== {label}: record {years[0]}-{years[-1]}, floods in {[y for y in years if flags[y]]}, "
          f"expected loss ${el:.0f}/yr, insurance premium ~${prem_year:.0f}/yr (before capital charge)")
    print(f"{'start':>5} {'seed':>5} {'yield':>5} | {'floods':>6} {'fully paid':>10} {'paid %':>7} {'pool/target':>11} "
          f"{'seed owed':>9} {'$/member/yr':>11}")
    for start in (years[0], max(years[0], 2014)):
        for seed, yld in ((0.0, 0.0), (0.5, 0.0), (0.5, 0.04)):
            r = run(flags, start, seed, yld, el, prem_year)
            pr = f"{100 * r['paid_ratio']:.0f}%" if r["paid_ratio"] is not None else "n/a"
            print(f"{start:>5} {seed:>5.1f} {yld:>5.2f} | {r['flood_years']:>6} {r['full']:>10} {pr:>7} "
                  f"{r['pool_end']:>10.2f}x {r['seed_out']:>8.2f}x {r['household_cost']:>11.0f}")
