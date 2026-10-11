"""Build the simulated 2,000-policy book (plan 7.6) and write it to sim_policies.

  python data/build_sim_book.py            # print the book and its capital numbers, change nothing
  python data/build_sim_book.py --write    # replace sim_policies with this book

Decisions (Ezekiel, Oct 10): 7 gauges (the four demo gauges plus Whiteoak, Buffalo at Houston and
Sims; Greens is not covered), payout mix 60% $500 / 30% $250 / 10% $1,000, seeded so the same book
comes out every time. The spread over gauges is a stated assumption, not data.

Basis: the book is priced on an ANNUAL basis (policies renew every 90 days), because the loss
scenarios are whole water years. So premium_usd here is the annual premium, E[L](1+theta) + c k_i
with t = 1 year, not the 90-day price a buyer sees in /quote.

Capital: K = max(worst complete scenario year, Harvey) - the MODEL mean, where the model mean is the
expected annual loss implied by the priced rates (what the premiums are loaded on). Using the mean
of the few scenario years instead leaves the reserve short of the mean K assumes it covers.
"""
import datetime as dt
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "engine"))

import db  # noqa: E402
import event_rate  # noqa: E402
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
DEMO = ["08075000", "08073700", "08069000", "08068500"]
MIX = [(500, 1200), (250, 600), (1000, 200)]  # (payout, count) over the whole book


def load(conn):
    """Gauges and comparable-record annual peaks for the book."""
    gauges = {r[0]: {"name": r[1], "trigger": r[2], "record_start": r[3]} for r in conn.execute(
        "SELECT gauge_id, name, trigger_ft, record_start FROM gauges WHERE gauge_id = ANY(%s)",
        (list(BOOK),)).fetchall()}
    assert set(gauges) == set(BOOK), f"missing gauges: {set(BOOK) - set(gauges)}"
    peaks: dict[str, dict[int, float]] = {}
    for g, wy, st in conn.execute(
            "SELECT p.gauge_id, p.water_year, p.peak_stage_ft FROM annual_peaks p JOIN gauges g USING (gauge_id) "
            "WHERE p.gauge_id = ANY(%s) AND p.peak_stage_ft IS NOT NULL "
            "AND (g.record_start IS NULL OR p.water_year >= g.record_start)", (list(BOOK),)):
        peaks.setdefault(g, {})[wy] = st
    return gauges, peaks


def event_counts_at(conn, gauges: dict, triggers: dict[str, float]) -> dict[str, list[int]]:
    """Events per complete water year at the given triggers (same rule as event_rate.py)."""
    last = event_rate.water_year(dt.datetime.now(dt.timezone.utc)) - 1
    out = {}
    for g, trig in triggers.items():
        first = max(gauges[g]["record_start"] or 2008, 2008)
        t0 = dt.datetime(first - 1, 10, 1, tzinfo=dt.timezone.utc)
        starts = [r[0] for r in conn.execute(event_rate.EVENTS, {"g": g, "t0": t0, "trig": trig})]
        out[g] = [sum(1 for s in starts if event_rate.water_year(s) == y) for y in range(first, last + 1)]
    return out


def make_rows() -> list[tuple[str, float]]:
    payouts = [b for b, n in MIX for _ in range(n)]
    random.Random(SEED).shuffle(payouts)
    rows, i = [], 0
    for g, n in BOOK.items():
        for _ in range(n):
            rows.append((g, float(payouts[i])))
            i += 1
    return rows


def evaluate(gauges, peaks, triggers, events) -> dict:
    """Book, rates, capital and reserve for one set of triggers."""
    rows = make_rows()
    draft = [pricing.BookPolicy(g, b, 0.0) for g, b in rows]
    losses = pricing.year_losses(draft, peaks, triggers)
    flags = {g: pricing.exceedances(list(peaks.get(g, {}).values()), triggers[g]) for g in BOOK}
    rate = {g: pricing.rate_higher_of(flags[g], events.get(g)) for g in BOOK}
    mean_model = pricing.model_mean_loss(draft, rate)
    K = pricing.required_capital(losses, settings.HARVEY_WATER_YEAR, mean_model)
    total_b = sum(p.payout for p in draft)
    book = []
    for g, b in rows:
        k_i = pricing.k_share(K, b, total_b)
        prem = pricing.premium(b, rate[g], 1.0, settings.THETA, settings.COST_OF_CAPITAL, k_i,
                               minimum=settings.MIN_PREMIUM)
        book.append(pricing.BookPolicy(g, b, round(prem, 2)))
    reserve = pricing.reserve_from_book(book, K, settings.COST_OF_CAPITAL, settings.EXPENSE_RATIO)
    return {"book": book, "losses": losses, "flags": flags, "rate": rate, "mean_model": mean_model,
            "K": K, "total_b": total_b, "reserve": reserve}


def quote_90d(r: dict, gauge: str, payout: float = 500.0) -> float:
    k = pricing.k_share(r["K"], payout, r["total_b"])
    return pricing.premium(payout, r["rate"][gauge], 90 / 365, settings.THETA, settings.COST_OF_CAPITAL, k,
                           minimum=settings.MIN_PREMIUM)


def main(write: bool) -> None:
    assert sum(BOOK.values()) == 2000 and sum(n for _, n in MIX) == 2000
    conn = db.connect()
    gauges, peaks = load(conn)
    events = {g: list(c) for g, c in conn.execute(
        "SELECT gauge_id, iv_counts FROM gauge_rates WHERE gauge_id = ANY(%s)", (list(BOOK),))}
    trig = {g: v["trigger"] for g, v in gauges.items()}
    r = evaluate(gauges, peaks, trig, events)
    book, losses, K = r["book"], r["losses"], r["K"]

    print(f"{'gauge':<9} {'name':<34} {'n':>4} {'exposure':>9} {'yrs':>3} {'lam':>5} {'avg prem':>8}")
    for g, n in BOOK.items():
        ps = [p for p in book if p.gauge_id == g]
        print(f"{g:<9} {gauges[g]['name'][:34]:<34} {n:>4} {sum(p.payout for p in ps):>9,.0f} "
              f"{len(peaks.get(g, {})):>3} {r['rate'][g]:>5.2f} {sum(p.premium for p in ps) / n:>8.2f}")
    print(f"\npolicies {len(book)}  total payout exposure ${r['total_b']:,.0f}  "
          f"annual premium ${sum(p.premium for p in book):,.0f}")
    print(f"scenario years (every gauge has a comparable peak): {min(losses)}-{max(losses)}  n={len(losses)}")
    for y, s in sorted(losses.items()):
        print(f"  WY{y}: loss ${s:>9,.0f}  ({100 * s / r['total_b']:4.1f}% of exposure)")
    hv = losses.get(settings.HARVEY_WATER_YEAR, 0.0)
    print(f"scenario-year mean ${sum(losses.values()) / len(losses):,.0f}; MODEL mean (premiums fund this) "
          f"${r['mean_model']:,.0f}; worst year ${max(losses.values()):,.0f}; Harvey ${hv:,.0f}")
    print(f"K = max(worst, Harvey) - model mean = ${K:,.0f}   reserve from premiums ${r['reserve']:,.0f}")
    for label, loss in (("Harvey", hv), ("worst year", max(losses.values()))):
        w = pricing.waterfall(loss, r["reserve"], K)
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
