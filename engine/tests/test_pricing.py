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
