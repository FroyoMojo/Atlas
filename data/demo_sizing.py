"""What the readiness demo will look like at a given pool size (read-only).

  python data/demo_sizing.py                    # 4 policies of $500, vault 1000, seed reserve 300
  python data/demo_sizing.py 4 600 300          # policies, SNAPSHOT_VAULT, SEED_RESERVE
  python data/demo_sizing.py 4 600 300 brays    # every buyer on Brays Bayou

Walks the demo in docs/readiness.md with the engine's own functions and live Tiger data: the price
each buyer sees as the pool is stretched by earlier buyers, the readiness and payout of run 1, the
donation that lifts the market to 100%, and the prices and payouts after it. Nothing is written.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "engine"))

from app import main as eng  # noqa: E402
from app import pricing, settings  # noqa: E402

n = int(sys.argv[1]) if len(sys.argv) > 1 else 4
vault0 = float(sys.argv[2]) if len(sys.argv) > 2 else 1000.0
seed = float(sys.argv[3]) if len(sys.argv) > 3 else 300.0
B = 500.0
bond_nominal = vault0 - seed
GAUGES = ["08075000", "08073700", "08069000", "08068500"]   # one policy each, in this order
if len(sys.argv) > 4 and sys.argv[4] == "brays":
    GAUGES = ["08075000"]                                       # all buyers on Brays: comparable prices

h = eng.history(fresh=True)
k = pricing.k_share(h["capital"], B, h["total_b"])
args = (settings.TERM_YEARS, settings.THETA, settings.COST_OF_CAPITAL, k)


def price(gid, community_funds, owed):
    flags = pricing.exceedances(list(h["peaks"][gid].values()), h["gauges"][gid]["trigger_ft"])
    lam = pricing.rate_higher_of(flags, h["events"].get(gid))
    std = pricing.premium(B, lam, *args, minimum=settings.MIN_PREMIUM)
    rc = pricing.readiness(community_funds, owed)
    now = pricing.premium(B, lam, *args, minimum=settings.MIN_PREMIUM, readiness_c=rc, expense=settings.EXPENSE_RATIO)
    return std, now, rc


print(f"pool: vault ${vault0:,.0f} = seed reserve ${seed:,.0f} + bond ${bond_nominal:,.0f}; {n} policies of ${B:,.0f}\n")
print("1) Buying the policies (readiness pricing on). Each buyer's price counts the pool already stretched by earlier buyers.")
print(f"   {'buyer':<6} {'gauge':<10} {'owed after':>10} {'community ready':>15} {'standard':>9} {'price':>7}")
community = pricing.funding_split(vault0, bond_nominal)[0]
total_premiums = 0.0
for i in range(n):
    gid = GAUGES[i % len(GAUGES)]
    owed = (i + 1) * B
    std, now, rc = price(gid, community + total_premiums, owed)
    total_premiums += now
    print(f"   {i + 1:<6} {gid:<10} {owed:>10,.0f} {100 * rc:>14.0f}% {std:>9.2f} {now:>7.2f}")
owed = n * B
vault1 = vault0 + total_premiums
comm1, out1 = pricing.funding_split(vault1, bond_nominal)
r1 = pricing.readiness(vault1, owed)
print(f"\n2) Run 1, no donation: vault ${vault1:,.2f} (community ${comm1:,.2f}, outside ${out1:,.2f}), "
      f"readiness {100 * r1:.0f}%, each household is paid ${B * r1:,.2f} of ${B:,.0f}")
need = max(0.0, owed - vault1)
print(f"\n3) A sponsor donation of ${need:,.2f} lifts the market to 100%.")
comm2, out2 = pricing.funding_split(vault1 + need, bond_nominal)
print(f"   vault ${vault1 + need:,.2f} (community ${comm2:,.2f}); a new buyer on each gauge would now see:")
print(f"   {'gauge':<10} {'standard':>9} {'now':>7} {'if ready':>9}")
for gid in GAUGES:
    std, now, _ = price(gid, comm2, owed + B)
    full = price(gid, 1e12, 1.0)[1]
    print(f"   {gid:<10} {std:>9.2f} {now:>7.2f} {full:>9.2f}")
print(f"\n4) Run 2: readiness {100 * pricing.readiness(vault1 + need, owed):.0f}%, each household is paid ${B:,.0f}.")
print(f"\nFor the readiness page before anyone buys: readiness {100 * pricing.readiness(vault0, 0.0):.0f}% "
      f"(nothing owed); with the first policy added, community readiness {100 * pricing.readiness(community, B):.0f}%.")
