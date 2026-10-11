# Devpost submission text

Draft for the Devpost page. Edit here so both of us work from one copy. Check every claim
against what is live at submission (marked TODO where it depends on the final setup).

## Elevator pitch (Devpost limit: 200 characters)

> When a Houston bayou floods, Atlas pays renters $500 in seconds: parametric flood cover priced from decades of USGS gauge data in Tiger Data and paid out on Solana.

Alternatives:

- Flood cover that pays in seconds, not weeks: a gauge crosses flood stage, and $500 lands in your wallet, with a public receipt of the reading that triggered it.
- Parametric flood protection for Houston renters: priced on 30+ years of gauge history, paid automatically on Solana the moment the bayou crosses its trigger.

## About the project (Markdown with LaTeX)

Paste everything between the lines into "About the project".

---

## Inspiration

Maria rents in Meyerland, on Brays Bayou in Houston. When Harvey hit in 2017, the water came in a single night. Renters' policies rarely cover flood, and federal flood claims and disaster aid take weeks to arrive. The first 72 hours, when you need a hotel, food and a replacement for a missed shift, are when nothing pays.

We are a finance major and a quant. We wanted to build the product an insurer, a city programme or a nonprofit could actually run: small, fixed, immediate cash that pays because a public measurement crossed a line, not because an adjuster visited.

## What it does

**Atlas** sells a small policy tied to the nearest USGS stream gauge. If that gauge crosses its flood trigger during the term, the policyholder gets a fixed payout (for example \\( B = 500 \\) aUSD, a test dollar), automatically, in seconds.

- **Buy:** pick a gauge on the map, see the quote with its confidence band, and buy in one wallet transaction. The policy is a non-transferable token in your wallet named **Atlas Policy ACTV**.
- **Trigger:** when a gauge records two consecutive accepted readings at or above its trigger, Atlas opens an event and records a hash of the exact reading.
- **Pay:** the payout bot sends the money with a Memo carrying that hash, and the policy turns **PAID** in the same transaction. The phone view shows "+$500 • PAID • Brays Bayou".
- **Verify:** anyone can recompute the hash from the recorded reading and match it to the on-chain Memo.
- **Solvency:** a pool page shows reserve, bond capital, the payout float and a reconciliation badge proving the books match the chain.

For the demo, we replay **Hurricane Harvey** from the real 2017 USGS record, squeezed into about 90 seconds and time-shifted to now. The map turns red bayou by bayou, and payouts land on a real phone.

## How we built it

**Tiger Data (TimescaleDB): the risk engine and the books**
- Gauge readings and the money ledger are **hypertables**. Decades of history sit in **columnstore** (compressed), and the live charts read a **continuous aggregate** of hourly maxima.
- Every money movement is a **double-entry ledger** row; every entry sums to zero.
- Events, storms, policies and payout intents live alongside, so one database answers "who gets paid, how much, and why".
- A FastAPI engine reads Tiger to price policies, stream the replay, open and close events, and reconcile.

**Solana (devnet): the money**
- `aUSD`, a test stablecoin, so we never depend on a faucet.
- Policies are **Token-2022** mints with NonTransferable, MetadataPointer, TokenMetadata and PermanentDelegate. The status lives in the token name (`ACTV` / `PAID`) so wallets show it.
- Purchase is **one atomic transaction**: premium to the vault, mint the policy, lock supply at 1. You can't pay without getting the policy, or the reverse.
- The pool's capital sits in a **Squads v4 2-of-3 multisig** vault with a time lock. The bot only holds a small payout float.
- Every payout is **signed, recorded, then sent**. After a crash, the bot settles every recorded signature before building anything new, so a policy is never paid twice.

**Vultr + GoDaddy Registry:** the whole stack (engine, chain service, payout bot and dashboard behind one gateway) runs on a Vultr instance at [atlasflood.us](https://atlasflood.us). <!-- TODO: confirm once the server is live -->

**Dashboard:** Vite + React with Leaflet, plus a phone view built to be mirrored on stage.

### The math

**Pricing.** For gauge \\( g \\), the annual exceedance rate comes from its comparable record of annual peaks, \\( \hat\lambda_g = N_g / T_g \\) (years at or above trigger over years observed). For a term \\( t \\):

$$ P(\text{payout}) = 1 - e^{-\hat\lambda_g t}, \qquad \pi = B\left(1 - e^{-\hat\lambda_g t}\right)(1+\theta) + c\,k_i $$

where \\( \theta \\) is the risk load and \\( c\,k_i \\) the cost of the capital the policy ties up. We bootstrap the years 2,000 times to show a 5th to 95th percentile band next to every quote.

**Correlated capital.** Floods hit every bayou at once, so each historical year is one scenario across all gauges:

$$ S_y = \sum_i B_i \,\mathbf{1}\{\text{peak}_{g(i),y} \ge \text{trigger}_{g(i)}\}, \qquad K = \max\Big(\max_y S_y,\; S_{\text{Harvey}}\Big) - \bar S, \qquad k_i = K\,\frac{B_i}{\sum_j B_j} $$

That is a worst-observed-year standard, not a modelled 1-in-200, and we say so.

**Paying fairly in a big storm.** If the pool can't cover everyone at once, everyone in the storm gets the same share, whatever order their gauges cross in. With available funds \\( A \\) (reserve plus bond capital):

$$ f_{\text{int}} = \min\!\Big(1,\ \frac{A}{B\,N_{\text{risk}}}\Big), \qquad f_{\text{fin}} = \min\!\Big(1,\ \frac{A}{B\,N_{\text{trig}}}\Big) \ \ge f_{\text{int}} $$

Each triggered policy gets \\( f_{\text{int}} B \\) immediately, and a true-up of \\( (f_{\text{fin}} - f_{\text{int}})B \\) when the storm closes. Losses hit the premium reserve first, then the catastrophe bond, whose NAV per unit falls accordingly.

**Evidence and books.** Each payout Memo is \\( \texttt{atlas:v3:}\,\mathrm{SHA256}(\text{preimage}) \\), where the preimage fixes the gauge, the latched reading, its time, the run, the storm and the event, byte for byte across Python, the bot and the browser. Every run reconciles:

$$ \text{opening balance} + \sum \text{ledger rows in the run} = \text{on-chain balance} $$

## Challenges we ran into

- **Gauges fail in the floods that matter.** In the real Harvey record, Whiteoak Bayou's gauge went dark mid-flood and came back with a single value, and both Buffalo Bayou gauges had gaps of 13 to 16 hours. Our data-quality guard had to tell a sensor glitch from a real rise of several feet after an outage, so the allowed jump grows with the length of the gap.
- **History isn't always comparable.** Brays Bayou's older annual peaks sit above its Harvey peak, a sign of a datum or channel change, so we price only from the comparable record.
- **Never paying twice.** Crash recovery, expired blockhashes and retried submits all had to resolve to exactly one payout and exactly one ledger entry.
- **Books that survive a demo reset.** Reset tops balances back up for the next judge, so absolute totals drift. We reconcile per run against opening balances instead, and book each transaction to the run open at its block time.
- **Devnet reality:** public RPC rate limits, and wallets that differ in how they accept a server-signed transaction.

## Accomplishments that we're proud of

- A real devnet payout triggered by a replay of the real Harvey record, with the evidence hash on-chain and the books reconciled. Then a reset and a second run, paid and reconciled again.
- One atomic purchase, storm-level fair shares with a true-up, and a payout path that can't double-pay.
- A full audit of our own code before submission, with every fix re-tested end to end through the hosted dashboard.

## What we learned

Parametric insurance is mostly a data problem and a trust problem. The data problem is choosing triggers from records that change under you. The trust problem is proving the payout followed the rule, which is what the hash, the public ledger and the reconciliation are for. And time-series databases make the actuarial work (annual peaks, scenario years, rolling aggregates) much simpler than we expected.

## What's next for Atlas

- An on-chain program that enforces the payout rule, and an oracle (e.g. Switchboard) for gauge readings, so no server decides to pay.
- Rainfall and multi-gauge triggers to reduce basis risk; NWS flood stages for every trigger.
- A licensed partner (insurer, city programme or nonprofit) to sell it, and a cash-out path through an off-ramp or a linked card.

## Limitations (honest version)

- **Basis risk:** payouts follow a gauge, not your street.
- **Devnet and test money only;** not a licensed insurance product, and the bond token would likely be a security.
- **The bot decides to pay;** the Memo makes that auditable, not enforced.
- **The catastrophe numbers** come from a simulated 2,000-policy book; on-chain capital is seeded test money.

---
