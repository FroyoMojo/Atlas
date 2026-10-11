# Readiness Markets (Oct 11): spec and task list

Atlas keeps its engine (data, triggers, on-chain payouts, website) and changes the product around
one idea: **a flood-protection market tells you, live, how much of its promised payout is funded
right now, and its price falls as the community prepares.** This page is the single source for what
we are building, what each of us does, and what we may claim.

## What it is

| Piece | Definition |
| --- | --- |
| **Readiness** | `min(1, funds available / payouts owed on policies in force)`. The share of each payout that would be paid if the trigger fired this minute. It is exactly the `f_int` pay factor the engine already applies (plan 7.5). "62% ready" = a household would get $310 of $500. |
| **Gap** | `owed x (1 - readiness)`; per household `gap / policies`. What is missing to be fully ready. |
| **Funding sources** | Households' premiums (they accumulate as the reserve), **donated sponsor funds** (new: a donation, no units), and outside capital (the bond, which expects a return). |
| **Readiness-linked price** | Only community money (seed reserve + premiums + donations) lowers the price. The risk load and capital charge shrink with it: `price = E[L](1 + theta(1 - r)) + c k t (1 - r)`, floor `E[L] / (1 - expenses)`. Brays, $500, 90 days: **$22.50 at 0%, $17.70 at 50%, $14.20 at 100%**. Off until `READINESS_PRICING=true`. |
| **Markets** | The four live demo gauges plus 11 **simulated** candidates, each graded A, B or C by stated rules (`engine/app/markets.py`). A simulated market is priced and shown with its gap to launch (`$500 x 500 households`); nothing is sold there. |
| **Atlas's side** | Atlas keeps the 10% expense load and a fee on funds under management. As a market matures its price, and Atlas's revenue per household, falls, so Atlas needs more households and more markets. That is the honest tension and the reason to launch markets. |

## The demo (shows that readiness changes what the household gets, not only the price)

Size the live pool small relative to the cover sold: `SNAPSHOT_VAULT=600` (seed reserve 300 + bond 300),
`SEED_RESERVE=300`, `MAX_DONATION=2000`. **All four buyers use Brays Bayou** (Meyerland), so the prices are
comparable. Numbers below come from `python data/demo_sizing.py 4 600 300 brays` on the live data.

| Step | What happens | Numbers |
| --- | --- | --- |
| 0 | Reset. The Readiness page says the pool "can fully fund $600 of cover, $0 sold" | |
| 1 | Four wallets buy $500 on Brays. Each price counts the pool already stretched by earlier buyers | $16.69, $19.43, $20.33, $20.77 (standard $22.50) |
| 2 | Readiness drops as cover is sold: $2,000 owed against about $677 of funds | **34% ready** |
| 3 | **Run 1.** Start the replay: every household is paid what the pool has, pro rata (`f_int`) | about **$169** of $500 each |
| 4 | Reset, buy again. A judge opens **Fund readiness** and donates about **$1,320** from their phone. Donate **before** Start: the run records its opening balance at Start | readiness **100%**; a new Brays quote falls to **$15.91** |
| 5 | **Run 2.** Start again | the full **$500** each |
| 6 | Payouts consume the donation, so the next Reset refills to the snapshot and the sequence repeats | |

Why the price only falls to $15.91 and not to the $14.23 "if ready" figure: the bond is 15% of the
pool even after the donation, and return-seeking capital does not lower the price (the rule we chose).

## What we may claim, and what we may not

- Say: *we found no open, on-chain, household-level flood product that publishes its own funded status per neighborhood and ties its price to preparedness.*
- Do **not** say nobody has done parametric flood insurance. FloodFlash (businesses), Jumpstart (earthquake renters) and a New York City pilot exist.
- The simulated markets are simulated. The other-region exposure is illustrative, and the diversification result rests on 8 complete years.
- A fully ready market is a market with enough pre-funded money for its worst observed year, not a modelled 1-in-200 event.

## Task list

### Ezekiel (engine and data): done unless noted

- [x] `pricing.readiness`, readiness-linked `premium` and bands (tests in `engine/tests/test_pricing.py`)
- [x] `GET /readiness`; `/quote` returns `readiness`, `community_readiness`, `premium_if_ready`, `readiness_pricing`
- [x] `candidate_markets` table and grades (`python data/build_candidate_markets.py`)
- [x] Reconciliation and `/pool` count `donations`
- [ ] Turn on `READINESS_PRICING=true` at demo sizing and recheck the quotes (with Jesse)
- [ ] Numbers for the slides: readiness, price curve, gap, grades (`docs/numbers.sql`)

### Jesse (chain and web)

1. [x] **Donation flow, chain side** (built; typechecked, not yet run on devnet). `POST /api/readiness/fund {account, amount}` and `/api/readiness/submit`: copy the bond deposit flow (`chain/src/lib/bond.ts`, server routes) but **do not mint bond units**. Cap with `MAX_DONATION` (default 2000), same allowlist and rate limit. Ledger: `donors -D`, `donations +D`, idempotent per `entry_id`, booked to the same run rule as other money. The engine already adds `donations` to the vault it expects and to the reserve.
2. [x] **Readiness page, web** (`#/readiness`; checked against a local engine). Fetch `/engine/readiness`. Per market: grade badge (A/B/C with the reason on hover), a bar for readiness with the sentence "$X of $500 would be paid today", the gap, and `price_now` against `price_if_ready`. Simulated markets carry a visible "Simulated" badge and show the gap to launch. A pool strip showing the four funding sources (`pool.funding`). A **Fund readiness** button.
3. [x] **Get protected page and My protection**: next to the quote show `readiness` and "falls to $price_if_ready when fully ready".
4. [ ] **Env on the server** (`/opt/atlas/.env`): `SNAPSHOT_VAULT=600`, `SEED_RESERVE=300`, `READINESS_PRICING=true`, `MAX_DONATION=2000`. Reset after changing.
5. [ ] **Rehearse** the demo above twice on `https://atlasflood.us`. The reconciliation badge must be green after every run.

Stretch, only if everything above is done: sponsored purchase (payer different from owner).

## Production runbook: switching the live site to the readiness demo (in this order)

Each step depends on the one before. Reset only tops balances **up** to the snapshot and never takes
money out, so shrinking the live vault needs its own step (the vault holds about $5,300 today).

1. **Deploy the code.** On the server: `bash /opt/atlas/deploy/vultr/deploy.sh`. Check `https://atlasflood.us/engine/readiness` answers.
2. **Set the env** in `/opt/atlas/.env`: `SNAPSHOT_VAULT=600`, `SEED_RESERVE=300`, `READINESS_PRICING=true`, `MAX_DONATION=2000`. Run `deploy.sh` again so the stack restarts with it.
3. **Press Reset** on the admin page. This puts every demo policy back to `ACTV` and writes a clean ledger baseline.
4. **Shrink the vault:** `cd /opt/atlas/chain && sudo -u atlas npm run shrink:vault -- 600`. It moves the excess to the treasury through the 2-of-3 proposal (about 1 to 2 minutes with the 60 s time lock) and writes `reserve -x, seeded +x` to the ledger. Run it with no run in progress.
5. **Check the pool:** `npm run status` shows the vault at 600; `GET /engine/readiness` shows `pool.funds_usd` 600 and `fully_funded_cover_usd` 600 with nothing sold.
6. **Buy four policies on Brays** from the four demo wallets. Quotes should read about $16.69, $19.43, $20.33, $20.77 and readiness about 34%.
7. **Run 1:** Start. Each household is paid about $169. The reconciliation badge must be green.
8. **Reset, buy again, donate** about $1,320 from a phone (**donate before Start**), check readiness 100% and that a new Brays quote is about $15.91, then **Run 2:** Start. Each household is paid $500. Green again.
9. Repeat 6 to 8 once more with no code changes. That is the freeze gate.

A donation that is not consumed by a run stays in the vault (Reset never removes money), so the
next readiness reading is higher than the snapshot. If that happens before judging, run step 4 again
after a Reset to bring the vault back to 600.

## Honest limits to keep in the pitch

- Readiness for a market that has never had a flood is a statement about *funds*, not about risk: it does not say how likely a flood is.
- The price cut is real only to the extent the pre-funded reserve is real. On devnet the money is test money.
- Houston's 2015 to 2017 flood cluster (three floods in three years) shows why readiness matters: a pool that saves its way up from nothing pays 25 to 80% in that sequence (`data/chest_sim.py`). Outside capital and sponsor funding are how a market gets ready before the next cluster.
