import datetime as dt
import math

from app import pricing
from app.evidence import evidence_hash, preimage, self_test


def test_evidence_vector():
    self_test()
    p = preimage("g1", 41.375, dt.datetime(2026, 10, 11, 3, 15, tzinfo=dt.timezone(dt.timedelta(hours=-5))),
                 "r", "r-s1", "r-e1")
    assert p == "atlas|v3|g1|41.38|2026-10-11T08:15:00Z|r|r-s1|r-e1|-|-"
    assert len(evidence_hash(p)) == 64


def test_premium_formula():
    flags = [True] * 3 + [False] * 27          # 3 exceedances in 30 years
    lam = pricing.annual_rate(flags)
    assert lam == 0.1
    p = pricing.premium(500, lam, 1.0, 0.35, 0.06, 20)
    assert math.isclose(p, 500 * (1 - math.exp(-0.1)) * 1.35 + 1.2)
    lo, hi = pricing.bootstrap_band(flags, 500, 1.0, 0.35, 0.06, 20, n=500)
    assert lo <= p <= hi and lo < hi
    assert pricing.bootstrap_band(flags, 500, 1.0, 0.35, 0.06, 20, n=500) == (lo, hi)  # seeded


def test_capital_and_waterfall():
    book = [pricing.BookPolicy("a", 500, 40), pricing.BookPolicy("a", 500, 40), pricing.BookPolicy("b", 1000, 60)]
    peaks = {"a": {2015: 10, 2016: 31, 2017: 35}, "b": {2015: 5, 2016: 5, 2017: 22}}
    losses = pricing.year_losses(book, peaks, {"a": 30, "b": 20})
    assert losses == {2015: 0, 2016: 1000, 2017: 2000}
    k_total = pricing.required_capital(losses, 2017)
    assert k_total == 1000                      # 2000 - mean(0, 1000, 2000)
    assert pricing.k_share(k_total, 500, 2000) == 250
    w = pricing.waterfall(2000, 300, 1000)
    assert (w.reserve_used, w.bond_used, w.investor_loss_pct) == (300, 1000, 100)
    assert math.isclose(w.f_fin, 0.65)
    assert pricing.pay_factor(1300, 4000) == 0.325 and pricing.pay_factor(10, 0) == 1.0


def test_rate_higher_of_uses_the_larger_estimate():
    flags = [True, False, False, False]                 # lambda_peak = 0.25
    assert pricing.rate_higher_of(flags, None) == 0.25
    assert pricing.rate_higher_of(flags, [0, 0, 0, 1]) == 0.25   # lambda_iv = 0.25, equal
    assert pricing.rate_higher_of(flags, [2, 1, 0, 0]) == 0.75   # two events in a year raise it
    assert pricing.rate_higher_of(flags, [0, 0, 0, 0]) == 0.25   # peaks win when iv is lower


def test_bootstrap_band_higher_of_brackets_the_point_premium_and_is_seeded():
    flags = [True, False, False, False, True, False, False, False]
    counts = [2, 0, 0, 1, 0, 0, 0, 1]
    t, theta, c, k = 0.2466, 0.35, 0.06, 0.0
    lam = pricing.rate_higher_of(flags, counts)
    point = pricing.premium(500, lam, t, theta, c, k)
    lo, hi = pricing.bootstrap_band_higher_of(flags, counts, 500, t, theta, c, k)
    assert lo <= point <= hi
    assert (lo, hi) == pricing.bootstrap_band_higher_of(flags, counts, 500, t, theta, c, k)
    # without event counts it reduces to the peak-only band
    assert pricing.bootstrap_band_higher_of(flags, None, 500, t, theta, c, k) == \
        pricing.bootstrap_band(flags, 500, t, theta, c, k)


def test_year_losses_uses_only_years_every_gauge_has_a_peak():
    book = [pricing.BookPolicy("a", 500, 40), pricing.BookPolicy("b", 500, 40)]
    peaks = {"a": {2014: 40, 2015: 10, 2016: 40}, "b": {2015: 30, 2016: 30}}   # b starts 2015
    trig = {"a": 30, "b": 20}
    assert pricing.year_losses(book, peaks, trig) == {2015: 500, 2016: 1000}   # 2014 dropped
    assert pricing.year_losses(book, peaks, trig, complete_years_only=False) == {2014: 500, 2015: 500, 2016: 1000}


def test_capital_charge_scales_with_the_term():
    base = pricing.premium(500, 0.3, 90 / 365, 0.35, 0.06, 0.0)
    with_k = pricing.premium(500, 0.3, 90 / 365, 0.35, 0.06, 312.38)
    assert math.isclose(with_k - base, 0.06 * 312.38 * 90 / 365)      # a quarter of the annual charge
    annual = pricing.premium(500, 0.3, 1.0, 0.35, 0.06, 312.38) - pricing.premium(500, 0.3, 1.0, 0.35, 0.06, 0.0)
    assert math.isclose(annual, 0.06 * 312.38)                         # the plan's c k at t = 1


def test_capital_uses_the_model_mean_when_given():
    losses = {2015: 0, 2016: 1000, 2017: 2000}               # scenario mean 1000
    assert pricing.required_capital(losses, 2017) == 1000
    assert pricing.required_capital(losses, 2017, mean_loss=400) == 1600   # 2000 - 400
    book = [pricing.BookPolicy("a", 500, 0), pricing.BookPolicy("b", 1000, 0)]
    m = pricing.model_mean_loss(book, {"a": 0.2, "b": 0.1})
    assert math.isclose(m, 500 * (1 - math.exp(-0.2)) + 1000 * (1 - math.exp(-0.1)))


def test_readiness_is_the_funded_share_and_nothing_owed_is_ready():
    assert pricing.readiness(1000, 2000) == 0.5
    assert pricing.readiness(5000, 2000) == 1.0          # capped
    assert pricing.readiness(0, 2000) == 0.0
    assert pricing.readiness(-5, 2000) == 0.0             # a negative balance never goes below zero
    assert pricing.readiness(0, 0) == 1.0                 # nothing owed


def test_readiness_linked_premium_falls_with_community_funded_share():
    lam, t, th, c, k, e = 0.1053, 90 / 365, 0.35, 0.06, 352.0, 0.10
    base = pricing.premium(500, lam, t, th, c, k)
    assert pricing.premium(500, lam, t, th, c, k, readiness_c=0.0, expense=e) == base      # unchanged at 0
    half = pricing.premium(500, lam, t, th, c, k, readiness_c=0.5, expense=e)
    full = pricing.premium(500, lam, t, th, c, k, readiness_c=1.0, expense=e)
    assert base > half > full
    el = 500 * pricing.p_payout(lam, t)
    assert math.isclose(full, el / (1 - e))                # floor: expected loss plus expenses
    assert math.isclose(half, el * (1 + th * 0.5) + c * k * t * 0.5)
    assert pricing.premium(500, lam, t, th, c, k, readiness_c=7.0, expense=e) == full  # readiness is clamped


def test_readiness_pricing_band_brackets_the_point_premium():
    flags = [True, False, False, False, True, False, False, False]
    kw = {"readiness_c": 0.5, "expense": 0.10}
    t, th, c, k = 0.2466, 0.35, 0.06, 300.0
    point = pricing.premium(500, pricing.annual_rate(flags), t, th, c, k, **kw)
    lo, hi = pricing.bootstrap_band(flags, 500, t, th, c, k, **kw)
    assert lo <= point <= hi
    lo2, hi2 = pricing.bootstrap_band(flags, 500, t, th, c, k, readiness_c=1.0, expense=0.10)
    assert lo2 <= lo and hi2 <= hi                          # cheaper at every percentile when more ready


def test_funding_split_uses_the_vault_and_treats_the_bond_as_the_last_layer():
    # demo sizing: vault 1000 = seed reserve 300 + bond 700
    assert pricing.funding_split(1000, 700) == (300, 700)
    assert pricing.funding_split(2000, 700) == (1300, 700)     # a 1000 donation is community money
    assert pricing.funding_split(1090, 700) == (390, 700)      # premiums too
    assert pricing.funding_split(500, 700) == (0, 500)          # reserve gone, bond partly used
    assert pricing.funding_split(0, 700) == (0, 0)              # drained after payouts
    assert pricing.funding_split(-3, 700) == (0, 0)


def test_demo_sequence_readiness_and_payouts():
    """The demo (docs/readiness.md): four $500 policies, vault 1000, then a 1000 donation."""
    owed = 4 * 500.0
    r1 = pricing.readiness(1000, owed)
    assert r1 == 0.5 and 500 * r1 == 250                          # run 1: each household is paid $250
    r2 = pricing.readiness(2000, owed)
    assert r2 == 1.0 and 500 * r2 == 500                          # after the donation: the full $500
    c1, _ = pricing.funding_split(1000, 700)
    c2, _ = pricing.funding_split(2000, 700)
    assert pricing.readiness(c1, owed) == 0.15 and pricing.readiness(c2, owed) == 0.65   # price drivers


def test_community_money_is_attributed_to_its_sources_and_adds_up():
    seed, prem, don = pricing.attribute_community(1300, 300, 0, 1000)    # demo after a 1000 donation
    assert math.isclose(seed + prem + don, 1300)
    assert math.isclose(don / seed, 1000 / 300)
    assert pricing.attribute_community(0, 300, 90, 1000) == (0.0, 0.0, 0.0)   # reserve spent
    assert pricing.attribute_community(500, 0, 0, 0) == (0.0, 0.0, 0.0)        # nothing contributed
    s2, p2, d2 = pricing.attribute_community(432.66, 300, 132.66, 0)
    assert math.isclose(s2 + p2 + d2, 432.66)
