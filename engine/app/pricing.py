"""Reference pricing and capital model, plan v3.1 section 7. Pure functions, no database.

Ezekiel owns the economics: these are a working baseline the dashboard can run on, written
straight from the plan's formulas so they can be checked and replaced piece by piece.
"""
import math
import random
from dataclasses import dataclass


def exceedances(peaks: list[float | None], trigger_ft: float) -> list[bool]:
    """One flag per water year with a recorded peak: did the annual peak reach the trigger?"""
    return [p >= trigger_ft for p in peaks if p is not None]


def annual_rate(flags: list[bool]) -> float:
    """lambda_peak = N_peak / T (7.1). The instantaneous-data rate is Ezekiel's to add; price
    with the higher of the two."""
    return sum(flags) / len(flags) if flags else 0.0


def p_payout(lam: float, t_years: float) -> float:
    return 1.0 - math.exp(-lam * t_years)


def premium(payout: float, lam: float, t_years: float, theta: float, c: float, k: float,
            minimum: float = 0.0) -> float:
    """pi = E[L](1 + theta) + c k t, with E[L] = B (1 - e^{-lambda t}) (7.2).

    The bond coupon rate c is per year, so the capital charge scales with the term: for the
    plan's one-year term this is the plan's c k; for a 90-day policy it is a quarter of it."""
    return max(minimum, payout * p_payout(lam, t_years) * (1 + theta) + c * k * t_years)


def bootstrap_band(flags: list[bool], payout: float, t_years: float, theta: float, c: float, k: float,
                   n: int = 2000, seed: int = 7, minimum: float = 0.0) -> tuple[float, float]:
    """5th to 95th percentile premium from resampling the years with replacement (7.2).
    Seeded, so the same history always gives the same band."""
    if not flags:
        p = premium(payout, 0.0, t_years, theta, c, k, minimum)
        return p, p
    rng = random.Random(seed)
    m = len(flags)
    sims = sorted(
        premium(payout, sum(rng.choices(flags, k=m)) / m, t_years, theta, c, k, minimum) for _ in range(n)
    )
    return sims[int(0.05 * (n - 1))], sims[int(0.95 * (n - 1))]


def rate_higher_of(flags: list[bool], event_counts: list[int] | None) -> float:
    """C3 (7.1): price with the higher of lambda_peak (share of years whose annual peak reached the
    trigger) and lambda_iv (events per year counted on the instantaneous record). lambda_iv can
    exceed lambda_peak when a gauge crosses more than once in a year."""
    lam_peak = annual_rate(flags)
    lam_iv = sum(event_counts) / len(event_counts) if event_counts else 0.0
    return max(lam_peak, lam_iv)


def bootstrap_band_higher_of(flags: list[bool], event_counts: list[int] | None, payout: float,
                             t_years: float, theta: float, c: float, k: float, n: int = 2000,
                             seed: int = 7, minimum: float = 0.0) -> tuple[float, float]:
    """5th to 95th percentile premium when pricing with the higher of the two rates: each draw
    resamples the peak years and the event-count years separately and takes the larger rate, so
    the band is consistent with `rate_higher_of`. Seeded, so the same history gives the same band."""
    if not event_counts:
        return bootstrap_band(flags, payout, t_years, theta, c, k, n, seed, minimum)
    if not flags:
        lam = sum(event_counts) / len(event_counts)
        p = premium(payout, lam, t_years, theta, c, k, minimum)
        return p, p
    rng = random.Random(seed)
    m, q = len(flags), len(event_counts)
    sims = sorted(
        premium(payout,
                max(sum(rng.choices(flags, k=m)) / m, sum(rng.choices(event_counts, k=q)) / q),
                t_years, theta, c, k, minimum)
        for _ in range(n))
    return sims[int(0.05 * (n - 1))], sims[int(0.95 * (n - 1))]


@dataclass
class BookPolicy:
    gauge_id: str
    payout: float
    premium: float


def year_losses(book: list[BookPolicy], peaks: dict[str, dict[int, float]],
                triggers: dict[str, float], complete_years_only: bool = True) -> dict[int, float]:
    """S_y = sum_i B_i 1{peak_{g(i),y} >= trigger_{g(i)}}: every year is one scenario across all
    gauges, so correlation is built in (7.3).

    Gauges have different comparable records (datum changes, F11). With complete_years_only a year
    counts only if every gauge that holds exposure has a comparable peak that year; otherwise early
    years would drop gauges, shrink S_y and bias the mean that K is measured against."""
    exposure: dict[str, float] = {}
    for p in book:
        exposure[p.gauge_id] = exposure.get(p.gauge_id, 0.0) + p.payout
    covered = [g for g in exposure if g in triggers]
    if complete_years_only and covered:
        years = sorted(set.intersection(*(set(peaks.get(g, {})) for g in covered)))
    else:
        years = sorted({y for by_year in peaks.values() for y in by_year})
    out: dict[int, float] = {}
    for y in years:
        out[y] = sum(
            b for g, b in exposure.items()
            if g in triggers and (pk := peaks.get(g, {}).get(y)) is not None and pk >= triggers[g]
        )
    return out


def required_capital(losses: dict[int, float], harvey_year: int) -> float:
    """K = max(max_y S_y, S_Harvey) - mean(S): worst observed year above the mean (7.3)."""
    if not losses:
        return 0.0
    mean = sum(losses.values()) / len(losses)
    worst = max(max(losses.values()), losses.get(harvey_year, 0.0))
    return max(0.0, worst - mean)


def k_share(capital: float, payout: float, total_payout: float) -> float:
    """k_i = K B_i / sum_j B_j."""
    return capital * payout / total_payout if total_payout > 0 else 0.0


def reserve_from_book(book: list[BookPolicy], capital: float, c: float, e: float) -> float:
    """Each premium is split once: expenses e pi, coupon c k to the bond, the rest to reserve (7.4)."""
    total = sum(p.payout for p in book)
    return sum(p.premium * (1 - e) - c * k_share(capital, p.payout, total) for p in book)


@dataclass
class Waterfall:
    loss: float
    reserve_used: float
    bond_used: float
    f_fin: float
    investor_loss_pct: float


def waterfall(loss: float, reserve: float, bond: float) -> Waterfall:
    """Losses hit the reserve, then bond capital, then the pay factor (7.4, 7.5)."""
    reserve = max(0.0, reserve)
    r = min(loss, reserve)
    b = min(loss - r, bond)
    f = min(1.0, (reserve + bond) / loss) if loss > 0 else 1.0
    return Waterfall(loss, r, b, f, 100.0 * b / bond if bond > 0 else 0.0)


def pay_factor(available: float, exposure: float) -> float:
    """f = min(1, A / (B N)) (7.5): f_int against the at-risk set, f_fin against the triggered set."""
    return min(1.0, available / exposure) if exposure > 0 else 1.0
