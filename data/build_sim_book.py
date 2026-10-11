"""Build the simulated 2,000-policy book (plan 7.6) and write it to sim_policies.

  python data/build_sim_book.py            # print the book and its capital numbers, change nothing
  python data/build_sim_book.py --write    # replace sim_policies with this book

Decisions (Ezekiel, Oct 10): 7 gauges (the four demo gauges plus Whiteoak, Buffalo at Houston and
Sims; Greens is not covered), payout mix 60% $500 / 30% $250 / 10% $1,000, seeded so the same book
comes out every time. The spread over gauges is a stated assumption, not data.

Basis: the book is priced on an ANNUAL basis (policies renew every 90 days), because the loss
scenarios are whole water years. So premium_usd here is the annual premium, E[L](1+theta) + c k_i
with t = 1 year, not the 90-day price a buyer sees in /quote. Capital K comes from the engine's own
functions (worst complete year above the mean, Harvey included), so this panel and /stress agree.
"""
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "engine"))

import db  # noqa: E402
from app import pricing, settings  # noqa: E402

SEED = 2026
BOOK = {  # gauge_id -> number of policies (sums to 2,000)
    "08075000": 440,   # Brays at Houston (Meyerland)
    "08073700": 280,   # Buffalo Bayou at Piney Point
    "08069000": 240,   # Cypress Creek nr Westfield
    "08068500": 200,   # Spring Creek nr Spring
    "08074500": 320,   # Whiteoak Bayou at Houston
    "08074000": 280,   # Buffalo Bayou at Houston
    "08075500": 240,   # Sims Bayou at Houston
}
MIX = [(500, 1200), (250, 600), (1000, 200)]  # (payout, count) over the whole book


def main(write: bool) -> None:
    assert sum(BOOK.values()) == 2000 and sum(n for _, n in MIX) == 2000
    conn = db.connect()
    gauges = {r[0]: (r[1], r[2], r[3]) for r in conn.execute(
        "SELECT gauge_id, name, trigger_ft, record_start FROM gauges WHERE gauge_id = ANY(%s)",
        (list(BOOK),)).fetchall()}
    assert set(gauges) == set(BOOK), f"missing gauges: {set(BOOK) - set(gauges)}"
    peaks: dict[str, dict[int, float]] = {}
    for g, wy, st in conn.execute(
            "SELECT p.gauge_id, p.water_year, p.peak_stage_ft FROM annual_peaks p JOIN gauges g USING (gauge_id) "
            "WHERE p.gauge_id = ANY(%s) AND p.peak_stage_ft IS NOT NULL "
            "AND (g.record_start IS NULL OR p.water_year >= g.record_start)", (list(BOOK),)):
        peaks.setdefault(g, {})[wy] = st
    events = {g: list(c) for g, c in conn.execute(
        "SELECT gauge_id, iv_counts FROM gauge_rates WHERE gauge_id = ANY(%s)", (list(BOOK),))}

    # Seeded payout assignment: an exact 60/30/10 mix over the whole book.
    payouts = [b for b, n in MIX for _ in range(n)]
    random.Random(SEED).shuffle(payouts)
    rows, i = [], 0
    for g, n in BOOK.items():
        for _ in range(n):
            rows.append((g, float(payouts[i])))
            i += 1

    trig = {g: v[1] for g, v in gauges.items()}
    draft = [pricing.BookPolicy(g, b, 0.0) for g, b in rows]
    losses = pricing.year_losses(draft, peaks, trig)
    K = pricing.required_capital(losses, settings.HARVEY_WATER_YEAR)
    total_b = sum(p.payout for p in draft)

    rate, flags = {}, {}
    for g in BOOK:
        flags[g] = pricing.exceedances(list(peaks.get(g, {}).values()), trig[g])
        rate[g] = pricing.rate_higher_of(flags[g], events.get(g))
    book = []
    for g, b in rows:
        k_i = pricing.k_share(K, b, total_b)
        prem = pricing.premium(b, rate[g], 1.0, settings.THETA, settings.COST_OF_CAPITAL, k_i,
                               minimum=settings.MIN_PREMIUM)
        book.append(pricing.BookPolicy(g, b, round(prem, 2)))
    reserve = pricing.reserve_from_book(book, K, settings.COST_OF_CAPITAL, settings.EXPENSE_RATIO)

    print(f"{'gauge':<9} {'name':<34} {'n':>4} {'exposure':>9} {'yrs':>3} {'lam':>5} {'avg prem':>8}")
    for g, n in BOOK.items():
        ps = [p for p in book if p.gauge_id == g]
        print(f"{g:<9} {gauges[g][0][:34]:<34} {n:>4} {sum(p.payout for p in ps):>9,.0f} "
              f"{len(peaks.get(g, {})):>3} {rate[g]:>5.2f} {sum(p.premium for p in ps) / n:>8.2f}")
    print(f"\npolicies {len(book)}  total payout exposure ${total_b:,.0f}  "
          f"annual premium ${sum(p.premium for p in book):,.0f}")
    print(f"scenario years (every gauge has a comparable peak): {min(losses)}-{max(losses)}  n={len(losses)}")
    for y, s in sorted(losses.items()):
        print(f"  WY{y}: loss ${s:>9,.0f}  ({100 * s / total_b:4.1f}% of exposure)")
    mean = sum(losses.values()) / len(losses)
    hv = losses.get(settings.HARVEY_WATER_YEAR, 0.0)
    print(f"mean annual loss ${mean:,.0f}; worst year ${max(losses.values()):,.0f}; Harvey (WY2017) ${hv:,.0f}")
    print(f"K = max(worst, Harvey) - mean = ${K:,.0f}   reserve from premiums ${reserve:,.0f}")
    for label, loss in (("Harvey", hv), ("worst year", max(losses.values()))):
        w = pricing.waterfall(loss, reserve, K)
        print(f"  {label:<10} loss ${loss:>9,.0f}: reserve used ${w.reserve_used:,.0f}, bond used "
              f"${w.bond_used:,.0f}, f_fin {w.f_fin:.3f}, investor loss {w.investor_loss_pct:.1f}%")

    if not write:
        print("\nDry run. Add --write to replace sim_policies.")
        return
    conn.execute("TRUNCATE sim_policies")
    n = len(book)
    conn.execute(
        "INSERT INTO sim_policies (sim_id, gauge_id, payout_usd, premium_usd) "
        "SELECT u.i, u.g, u.b, u.p FROM unnest(%s::bigint[], %s::text[], %s::numeric[], %s::numeric[]) "
        "AS u(i, g, b, p)",
        (list(range(1, n + 1)), [p.gauge_id for p in book], [p.payout for p in book],
         [p.premium for p in book]))
    print(f"\nwrote {conn.execute('SELECT count(*) FROM sim_policies').fetchone()[0]} rows to sim_policies")


if __name__ == "__main__":
    main("--write" in sys.argv)
