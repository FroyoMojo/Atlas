"""Audit of the investor (bond) layer: what would bond holders have lost each year?

  python data/bond_audit.py

Uses the simulated book and the engine's own capital definition. Each water year is replayed
against the pool: losses hit the premium-funded reserve first, then the bond. Coupon is the
engine's c (6%) on K. Two samples: the 7-gauge book over its complete years (WY2015 to WY2024),
and a 5-gauge subset with a longer window (WY2010 to WY2025) to see if the answer depends on the
decade chosen. Read-only.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "engine"))

import build_sim_book as bsb  # noqa: E402
import db  # noqa: E402
from app import pricing, settings  # noqa: E402


def audit(label, book_counts):
    conn = db.connect()
    bsb.BOOK = book_counts
    gauges, peaks = bsb.load(conn)
    events = {g: list(c) for g, c in conn.execute(
        "SELECT gauge_id, iv_counts FROM gauge_rates WHERE gauge_id = ANY(%s)", (list(book_counts),))}
    trig = {g: v["trigger"] for g, v in gauges.items()}
    r = bsb.evaluate(gauges, peaks, trig, events)
    K, R, losses = r["K"], r["reserve"], r["losses"]
    print(f"\n=== {label}: {len(book_counts)} gauges, exposure ${r['total_b']:,.0f}, K ${K:,.0f}, reserve ${R:,.0f}, "
          f"scenario years {min(losses)}-{max(losses)} (n={len(losses)})")
    c = settings.COST_OF_CAPITAL
    tot = 0.0
    for y, s in sorted(losses.items()):
        bond_loss = max(0.0, min(K, s - R))
        tot += bond_loss
        net = (c * K - bond_loss) / K
        print(f"  WY{y}: pool loss ${s:>9,.0f}   bond loses {100 * bond_loss / K:5.1f}% of principal   "
              f"net of {100 * c:.0f}% coupon {100 * net:+6.1f}%")
    n = len(losses)
    el = tot / n / K
    hit = sum(1 for s in losses.values() if s > R)
    print(f"  years the bond loses anything: {hit} of {n}; expected annual loss {100 * el:.1f}% of principal "
          f"vs coupon {100 * c:.0f}%; break-even coupon about {100 * el:.0f}%")
    print(f"  worst year {100 * max(max(0.0, min(K, s - R)) for s in losses.values()) / K:.0f}% loss")


audit("7-gauge book", {"08075000": 440, "08073700": 280, "08069000": 240, "08068500": 200,
                       "08074500": 320, "08074000": 280, "08075500": 240})
audit("5-gauge, longer window", {"08075000": 440, "08073700": 280, "08074500": 320,
                                 "08074000": 280, "08075500": 240})
