# Demo script and judge Q&A (plan v3.1 sections 10 and 11)

The moment that wins: the bayou line turns red and the phone view shows the payout at the same
instant. Expo-style table judging rarely gives 4 minutes, so the 90-second version is the default.

**Set-up:** map on the laptop; phone view (`#/phone?owner=<address>`) mirrored beside it; admin
token loaded (`#/admin`); fallback video open in another tab; one backup policy already bought on
a second demo wallet. Name the bayou only after the data confirms it triggers (Brays preferred).

## 90-second version

| Time | Beat |
| --- | --- |
| 0:00 to 0:15 | "Maria rents in Meyerland. Federal flood claims take weeks. She needs money in the first 72 hours." |
| 0:15 to 0:35 | Tap a demo gauge. Quote: probability, premium, band. Buy on the phone. If it hasn't confirmed in 10 seconds: "here's one we bought earlier", switch to the backup wallet. |
| 0:35 to 1:10 | Start the replay. The map turns red; the phone view shows "+$500 • PAID • Brays Bayou". |
| 1:10 to 1:30 | Pool page: reserve used, bond absorbs the rest, reconciliation green. "Priced from decades of gauge data in Tiger Data, settled on Solana in seconds." |

## 4-minute version

| Time | Beat |
| --- | --- |
| 0:00 to 0:30 | The gap, told through Maria. One sentence on Atlas. |
| 0:30 to 1:15 | A demo gauge. Quote with band and the history behind it. Buy on the phone (backup ready). "Waiting period is off in demo mode." |
| 1:15 to 2:30 | Replay. Map turns red; payouts land; phone shows PAID. Storm closes: "everyone in the storm gets the same share." Pool: reserve used, NAV drops. |
| 2:30 to 3:00 | Verify one payout: preimage, hash, Memo match. |
| 3:00 to 3:30 | Numbers: worst-year capital need, simulated interim and true-up shares, Tiger compression ratio. |
| 3:30 to 4:00 | Limitations in one breath (basis risk, licensing, cash-out), then the close. |

## Demo rules

- Only the four `demo_ready` gauges. Never invite judges to name any bayou.
- Press Reset before every judge group; check the reconciliation badge is green.
- One full run 20 minutes before judging.
- Phone: Phantom in Testnet Mode, funded, screen lock off.
- Never debug in front of judges: switch to the fallback video within 15 seconds.

## Judge Q&A

| Question | Answer |
| --- | --- |
| Your bot decides to pay. What does the chain add? | Purchase is one atomic transaction, so payment can't be separated from the policy. Every payout carries a Memo hash of the exact reading it acted on. Solvency and every payout are public. A Solana program enforcing the payout rule is the production step. |
| Is the payout fair in a big storm? | Every triggered policy gets the same interim share at once, sized against all policies that could trigger, and a true-up when the storm closes. Order of crossing doesn't matter. |
| Which numbers are real? | On-chain panel: real devnet balances, with the starting capital labelled seeded. Simulated panel: a 2,000-policy book, labelled. |
| How do you know the books are right? | Every money movement is a ledger row. Each run's opening balances plus its ledger rows equal the on-chain balances afterwards; the badge shows it. |
| How does Maria cash out? | In this build she can't. Off-ramps exist through third parties; production would partner with one or pay through a card linked to the wallet. |
| What if the gauge triggers but my street stayed dry? | Basis risk, the core trade-off of parametric cover. Payouts are small and fixed for immediate needs. Rainfall and multi-gauge triggers are next. |
| How did you size capital? | Each historical year is a scenario across all gauges, so correlation is built in. Capital covers the worst observed year above the mean: a worst-year standard, not a modelled 1-in-200. |
| Is your flood history comparable over time? | Datum and channel changes were checked per gauge; pricing uses only the comparable record. |
| Is this legal? | Selling insurance needs a licence; the bond token is likely a security. Atlas is the engine an insurer, city programme or nonprofit would run. |
| Can you fake the oracle? | In this build the bot reads Tiger and the replay is served by our server; we say so. An on-chain oracle is the production path. |
| Why not buy cover when a storm is coming? | 7-day waiting period, and sales freeze while a flood watch or warning is active at the gauge. |
| What stops double payment? | Every payout is signed and recorded before it's sent; a restarted bot settles every recorded signature before building anything new. |
| Why does aUSD supply keep growing? | Reset mints test aUSD to restore the pool between demo runs. In production there is no reset. |
