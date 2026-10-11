# Devpost submission text

Draft for the Devpost page. Edit here so both of us work from one copy. Check every claim
against what is live at submission (marked TODO where it depends on the final setup).

## Elevator pitch (Devpost limit: 200 characters)

> Emergency money when your bayou floods, paid in seconds on Solana. Atlas shows how much of your payout is funded right now, and your price falls as your neighborhood gets ready.

Alternatives:

- Flood protection that pays in seconds, not weeks: the river gauge crosses flood level and $500 lands in your wallet, with a public receipt of the reading that triggered it.
- $500 for the first night of a flood: priced from 19 years of USGS river data in Tiger Data, paid automatically on Solana when your bayou floods.

## About the project (Markdown with LaTeX)

Paste everything between the lines into "About the project".

---

## Inspiration

Maria rents in Meyerland, on Brays Bayou in Houston. When Harvey hit in 2017, the water came in a single night. Renters' policies rarely cover flood, and federal flood claims and disaster aid take weeks to arrive. The first 72 hours, when you need a hotel, food and a replacement for a missed shift, are when nothing pays.

We are a finance major and a quant. We wanted to build the product an insurer, a city programme or a nonprofit could actually run: small, fixed, immediate cash that pays because a public measurement crossed a line, not because an adjuster visited.

## What it does

**Atlas** is emergency money for the first days of a flood. You protect your home's neighborhood for 90 days; if the river gauge that watches it reaches the official flood level, a fixed amount (for example \\( B = 500 \\) aUSD, a test dollar) lands in your wallet automatically, in seconds. It is a fixed emergency payment for residents (one per household), not property insurance and not a bet on the weather.

- **Get protected:** type your ZIP or neighborhood. A covered address turns green and shows the gauge and flood level that would pay you; an uncovered one turns red. Pick $250 or $500, see the price ($22.50 for $500 in Meyerland), and confirm one wallet transaction. "Why $22.50?" shows the basis: Brays Bayou reached flood level 2 times in 19 years of records. The policy is a non-transferable token in your wallet named **Atlas Policy ACTV**.
- **You're protected:** your page shows the river level against the flood line, days left and your balance.
- **Trigger:** when a gauge records two consecutive accepted readings at or above its flood level, Atlas opens an event and records a hash of the exact reading.
- **Pay:** the payout bot sends the money with a Memo carrying that hash, and the policy turns **PAID** in the same transaction. The phone switches to "Flood detected · Meyerland. We've sent you $500 for immediate costs", with what to do right now: call 911 if in danger, find a shelter, use the money for a room or food.
- **Proof:** one page shows the money set aside and a "matches the blockchain" check, lists every payout with a **Verify** button that recomputes the reading's fingerprint in your browser, and stress-tests the pool against another Harvey.
- **Readiness:** every market shows, live, how much of its promised payout is funded right now: "if the river crossed the line this minute you would get $169 of $500". The gap to fully funded is shown per household, and the price falls as the community's own money (premiums and donated sponsor funds) covers more of the risk. Anyone can fund readiness from a wallet, and a market that is only partly ready pays everyone the same share until it is topped up. TODO(live): confirm the $169 and the prices after the first production run.
- **Markets:** the four live Houston gauges, plus eleven simulated candidates in other regions that Atlas grades A, B or C from the same data (how often the trigger was reached, how many comparable years, how many events). Simulated markets are priced and shown with their gap to launch; nothing is sold there.

For the demo, we replay **Hurricane Harvey** from the real 2017 USGS record: about five days of 15-minute readings at our four covered gauges (Brays Bayou, Buffalo Bayou at Piney Point, Cypress Creek and Spring Creek), squeezed into about 90 seconds and time-shifted to now. The map turns red bayou by bayou, the live feed reports each flood in plain words, and payouts land on a real phone.

Cover runs for 90 days for one premium. Triggers sit at each gauge's National Weather Service **moderate** flood stage, which prices \\( 500 \\) aUSD of cover at about 22 to 58 aUSD per 90 days on the demo gauges.

## How we built it

**Tiger Data (TimescaleDB): the risk engine and the books**
- Gauge readings and the money ledger are **hypertables**. The 2007 to 2026 instantaneous history (from 2011 for Spring Creek; **more than 6.5 million readings**) sits in **columnstore**, compressed from 1,000 MB to 155 MB (6.5x). The history charts read a **continuous aggregate** of hourly maxima, spot-checked against the raw readings.
- Annual peaks go back 60 to 92 years per gauge. USGS datum-change flags set where each gauge's comparable, priced record starts (2007 to 2015), so prices rest on 11 to 19 comparable years.
- Every money movement is a **double-entry ledger** row; every entry sums to zero.
- Events, storms, policies and payout intents live alongside, so one database answers "who gets paid, how much, and why".
- A FastAPI engine reads Tiger to price policies, stream the replay, open and close events, and reconcile.

**Solana (devnet): the money**
- `aUSD`, a test stablecoin, so we never depend on a faucet.
- Policies are **Token-2022** mints with NonTransferable, MetadataPointer, TokenMetadata and PermanentDelegate. The status lives in the token name (`ACTV` / `PAID`) so wallets show it.
- Purchase is **one atomic transaction**: premium to the vault, mint the policy, lock supply at 1. You can't pay without getting the policy, or the reverse.
- The pool's capital sits in a **Squads v4 2-of-3 multisig** vault with a time lock. The payout bot only holds a capped float, refilled from the vault by a 2-of-3 proposal.
- Every payout is **signed, recorded, then sent**. After a crash, the bot settles every recorded signature before building anything new, so a policy is never paid twice.

**Readiness Markets: preparedness you can see and fund**
- Readiness is the pay factor our engine already applies in a storm, shown before the storm: funds available divided by payouts owed. The funding split reads the vault's real balance from the chain, so the bar on the page adds up to what is actually there.
- The price falls only with community money (seed reserve, household premiums, donated sponsor funds), never with return-seeking bond capital. A **Fund readiness** flow lets a sponsor donate aUSD to the vault from a wallet, with no bond units minted; the ledger books it as `donors -D, donations +D`, and reconciliation counts it.
- Each market gets a grade from stated rules (trigger reached in 5 to 35% of years, 15 or more comparable years, at least two events) so the grade can be audited.

**Vultr + GoDaddy Registry:** the whole stack (engine, chain service, payout bot and dashboard behind one gateway) runs on one Ubuntu Vultr instance behind Caddy (automatic HTTPS) and systemd at [atlasflood.us](https://atlasflood.us), a domain registered through the GoDaddy Registry offer.

**Dashboard:** Vite + React with Leaflet: a map with the Harvey replay, a phone-first "Get protected" and "My protection" flow, and a Proof page that verifies payouts in the browser. The phone view can be mirrored on stage.

### The math

**Pricing.** For gauge \\( g \\) we estimate the yearly event rate two ways, from annual peaks (\\( \hat\lambda^{\text{peak}}_g = N_g / T_g \\)) and from instantaneous readings with the contract's own open and close rule (\\( \hat\lambda^{\text{iv}}_g \\), since one year can hold several floods), and price with the higher. For a term \\( t \\) (90 days):

$$ \hat\lambda_g = \max\big(\hat\lambda^{\text{peak}}_g , \hat\lambda^{\text{iv}}_g\big) \qquad P(\text{payout}) = 1 - e^{-\hat\lambda_g t} \qquad \pi = B\left(1 - e^{-\hat\lambda_g t}\right)(1+\theta) + c k_i t $$

where \\( \theta \\) is the risk load and \\( c k_i t \\) the cost of the capital the policy ties up for its term. We bootstrap the years 2,000 times to show a 5th to 95th percentile band next to every quote.

**Correlated capital.** Floods hit every bayou at once, so each water year in which every gauge in the book has a comparable peak (WY2015 to WY2024, ten years) is one scenario across all gauges:

$$ S_y = \sum_i B_i \cdot \mathbf{1}\left[\text{peak}_{g(i),y} \ge \text{trigger}_{g(i)}\right] \qquad K = \max\Big(\max_y S_y , S_{\text{Harvey}}\Big) - \mathbb{E}[L] \qquad k_i = K \frac{B_i}{\sum_j B_j} $$

where \\( \mathbb{E}[L] \\) is the expected annual loss implied by the priced rates. That is a worst-observed-year standard, not a modelled 1-in-200, and we say so. On our simulated 2,000-policy book over seven gauges, \\( \mathbb{E}[L] \\) is about $168k and \\( K \\) about $669k. Harvey (water year 2017) is the worst year: a $837k loss, paid in full (\\( f_{\text{fin}} = 1 \\)).

**How the money is layered.** Our first design put investors right behind a thin premium reserve, so they took almost every bad year; on our own data that bond lost money in 5 of 10 years, which nobody would buy. The design we're pitching stacks the money in three layers:

1. **Community fund** (premiums plus sponsor donations): pays first and covers ordinary bad years. This is what the readiness meter shows.
2. **Investors (a catastrophe bond):** attaches at 40% of total exposure and is used up at 90%. It pays T-bill interest plus a spread set at three times its expected loss. Priced on our data, the old structure had an expected loss of 16 to 26% a year, which would need a coupon of 50 to 80%. A bond that pools seven markets (Houston plus six graded candidates, flooding independently) has an expected loss of 1.4% a year, loses some principal in about one year in nine, and needs a coupon of about 8%. Houston alone would need about 45%, which is why Atlas pools markets.
3. **Public backstop** (a city, state or reinsurer): anything bigger than both.

The pooled bond is a simulation, not a live product: it assumes the regions flood independently, uses 16 to 18 years of public data, and takes the 3x multiple from market convention. The same cost holds for households: $475k of bond at 8% is about $38k a year, against about $40k today for 6% on $669k. In the demo only Houston is live, so the pool runs a simpler version: a reserve, then bond capital. The figures come from `data/cat_bond_design.py` and `data/cat_bond_pooled.py`.

**Paying fairly in a big storm.** If the pool can't cover everyone at once, everyone in the storm gets the same share, whatever order their gauges cross in. With available funds \\( A \\) (reserve plus bond capital at the start of the run), \\( E_{\text{risk}} \\) the payouts of active policies on gauges under a flood watch when the storm opens, and \\( E_{\text{trig}} \\) the payouts on gauges that actually triggered:

$$ f_{\text{int}} = \min\Big(1 , \frac{A}{E_{\text{risk}}}\Big) \qquad f_{\text{fin}} = \max\Big(f_{\text{int}} , \min\Big(1 , \frac{A}{E_{\text{trig}}}\Big)\Big) $$

Each triggered policy gets \\( f_{\text{int}} B \\) immediately, and a true-up of \\( (f_{\text{fin}} - f_{\text{int}}) B \\) when the storm closes. Losses hit the premium reserve first, then the catastrophe bond, whose NAV per unit falls accordingly.

**Readiness and price.** With funds \\( F \\) available and payouts \\( O \\) owed on policies in force, readiness is \\( r = \min(1, F/O) \\): the share of each payout paid if the trigger fired now. Let \\( r_c \\) be the part covered by community money only. The two charges that pay outside capital for carrying risk shrink with it:

$$ \pi(r_c) = \max\Big( \frac{\mathbb{E}[L]}{1-e} ,\ \mathbb{E}[L]\big(1+\theta(1-r_c)\big) + c\,k_i\,t\,(1-r_c) \Big) $$

where \\( e \\) is the expense ratio. For a $500 policy on Brays Bayou over 90 days this is $22.50 with no community funding, about $17.70 at half and $14.20 when fully funded.

**Evidence and books.** Each payout Memo is `atlas:v3:` followed by \\( \mathrm{SHA256}(\text{preimage}) \\), where the preimage fixes the gauge, the latched reading, its time, the run, the storm and the event, byte for byte across Python, the bot and the browser. Every run reconciles, separately for the vault and for the payout float:

$$ \text{opening balance} + \sum \text{this run's ledger rows for that account} = \text{on-chain balance} $$

## Challenges we ran into

- **Gauges fail in the floods that matter.** In the real Harvey record, several gauges went dark for 13 to 99 hours mid-flood (Whiteoak Bayou came back with a single value). A crossing seen across a gap is an artifact, so those gauges are not covered. A naive jump filter also deleted real Harvey rises (Brays went from 27.0 to 30.4 to 34.9 ft in two readings), so the loader rejects only spikes that jump away and straight back, and the replay allows larger moves across a gap.
- **History isn't always comparable.** Gauge datums and channels change over decades. We start each gauge's priced record the year after USGS flags a datum change, so an old peak measured on a different zero can't distort today's price.
- **Some places are too risky to insure cheaply.** Greens Bayou crosses its minor flood stage about once a year, which would have meant a 105 aUSD premium for 500 aUSD of cover. We dropped it rather than hide that, and moved triggers to the moderate flood stage.
- **Never paying twice.** Crash recovery, expired blockhashes and retried submits all had to resolve to exactly one payout and exactly one ledger entry.
- **Books that survive a demo reset.** Reset tops balances back up for the next judge, so absolute totals drift. We reconcile per run against opening balances instead, and book each transaction to the run open at its block time.
- **A community cannot save its way out of a flood cluster.** We backtested a neighborhood pool that funds itself against the real record. Houston flooded three years running (2015 to 2017), before any pool could mature, and a self-funded pool paid only 25 to 80% of what was owed. That is why readiness is shown and funded openly, and why outside capital is still needed.
- **Preparedness is relative to what is sold.** Selling more cover against the same reserve lowers readiness, so each buyer's price rises as the pool is stretched ($16.69, $19.43, $20.33, $20.77 for four buyers on Brays) and falls when it is funded. That is the point, and it needs explaining on stage.
- **Devnet reality:** public RPC rate limits, and wallets that differ in how they accept a server-signed transaction.

## Accomplishments that we're proud of

- A real devnet payout triggered by a replay of the real Harvey record, with the evidence hash on-chain and the books reconciled. Then a reset and a second run, paid and reconciled again.
- One atomic purchase, storm-level fair shares with a true-up, and a payout path that can't double-pay.
- Two full audits of our own code before submission, with every fix re-tested end to end through the dashboard on devnet.

## What we learned

We tested ideas against our own data and dropped the ones that failed: a retail catastrophe bond (the bond would have lost money in 5 of 10 years), a self-funded community chest (paid 25 to 80% in the 2015 to 2017 cluster) and early-warning payouts (about eight in ten action-stage alerts were false alarms). What survived is smaller and more honest: show how funded a market is, and let the price follow. Parametric insurance is mostly a data problem and a trust problem. The data problem is choosing triggers from records that change under you. The trust problem is proving the payout followed the rule, which is what the hash, the public ledger and the reconciliation are for. And time-series databases make the actuarial work (annual peaks, scenario years, rolling aggregates) much simpler than we expected.

## What's next for Atlas

- Launch real markets beyond Houston from the graded candidates, with real sponsors and partner organizations, instead of simulated ones.
- An on-chain program that enforces the payout rule, and an oracle (e.g. Switchboard) for gauge readings, so no server decides to pay.
- Rainfall and multi-gauge triggers to reduce basis risk; NWS flood stages for every trigger.
- A licensed partner (insurer, city programme or nonprofit) to sell it, and a cash-out path through an off-ramp or a linked card.

## Limitations (honest version)

- **Basis risk:** payouts follow a gauge, not your street.
- **Devnet and test money only;** not a licensed insurance product, and the bond token would likely be a security.
- **The bot decides to pay;** the Memo makes that auditable, not enforced.
- **The catastrophe numbers** come from a simulated 2,000-policy book (the spread over gauges is an assumption); on-chain capital is seeded test money.
- **Simulated markets are simulated.** The eleven candidate markets are priced and graded from public data, but no policies are sold there, and the diversification result (a pool spread across regions needs about a third less capital) rests on eight complete years.
- **Readiness is about funds, not risk.** A market that has never flooded can read 100% ready; it says how much is funded, not how likely a flood is. On devnet the donations are test money.
- **We found no open, on-chain, household-level flood product that publishes its own funded status and ties price to preparedness; we did not find none exist.** Parametric flood cover for businesses (FloodFlash), parametric earthquake cover for renters (Jumpstart) and a New York City flood pilot all exist.
- **No seasonality yet:** the price uses a yearly rate for a 90-day term, so cover bought in the quiet season is overpriced and cover bought before hurricane season is underpriced.

---
