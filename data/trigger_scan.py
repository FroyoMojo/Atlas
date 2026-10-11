"""Option 2: how do the premiums and the capital numbers change if the trigger is raised from the
NWS minor flood stage to moderate or major? Read-only; nothing is written to Tiger.

  python data/trigger_scan.py

Same 7-gauge, 2,000-policy book each time. Triggers per scheme come from the NWS flood categories
in data/reports/preflight_report.json. Demo gauges must still cross in Harvey by a safe margin.
"""
import json

import build_sim_book as bsb
import common
import db
from app import settings

rep = json.loads((common.REPORT_DIR / "preflight_report.json").read_text())
stages = rep["nws"]["stages"]

if __name__ == "__main__":
    conn = db.connect()
    gauges, peaks = bsb.load(conn)
    # Harvey peak per gauge from annual peaks (same series the rates use)
    harvey = {g: peaks[g].get(settings.HARVEY_WATER_YEAR) for g in bsb.BOOK}
    for scheme in ("minor", "moderate", "major"):
        trig = {g: stages[g][scheme] for g in bsb.BOOK}
        # Always recount: gauge_rates holds counts at the current triggers, not at this scheme's.
        events = bsb.event_counts_at(conn, gauges, trig)
        r = bsb.evaluate(gauges, peaks, trig, events)
        hv = r["losses"].get(settings.HARVEY_WATER_YEAR, 0.0)
        mean_scn = sum(r["losses"].values()) / len(r["losses"])
        print(f"\n=== trigger = NWS {scheme} flood stage ===")
        print(f"{'gauge':<9} {'name':<30} {'trig':>6} {'harv margin':>11} {'exc':>3}/{'yrs':<3} {'lam_pk':>6} {'lam_iv':>6} "
              f"{'90d $500':>8}{'  demo' }")
        for g in bsb.BOOK:
            fl = r["flags"][g]
            ev = events.get(g)
            lam_iv = sum(ev) / len(ev) if ev else 0.0
            hm = harvey[g] - trig[g] if harvey[g] is not None else float("nan")
            print(f"{g:<9} {gauges[g]['name'][:30]:<30} {trig[g]:>6} {hm:>+11.2f} {sum(fl):>3}/{len(fl):<3} "
                  f"{sum(fl) / len(fl):>6.2f} {lam_iv:>6.2f} {bsb.quote_90d(r, g):>8.2f}"
                  f"{'  *' if g in bsb.DEMO else ''}")
        w = pricing_w = None
        from app import pricing
        w = pricing.waterfall(hv, r["reserve"], r["K"])
        print(f"book: exposure ${r['total_b']:,.0f}; annual premium ${sum(p.premium for p in r['book']):,.0f}; "
              f"model mean loss ${r['mean_model']:,.0f}; scenario-year mean ${mean_scn:,.0f}")
        print(f"      Harvey loss ${hv:,.0f} ({100 * hv / r['total_b']:.0f}% of exposure); K ${r['K']:,.0f}; "
              f"reserve ${r['reserve']:,.0f}")
        print(f"      Harvey: reserve used ${w.reserve_used:,.0f}, bond used ${w.bond_used:,.0f} "
              f"({w.investor_loss_pct:.0f}% of bond), f_fin {w.f_fin:.3f}")
        print(f"      rate on line (annual premium / exposure): {100 * sum(p.premium for p in r['book']) / r['total_b']:.1f}%")
