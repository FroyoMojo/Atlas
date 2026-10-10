# Demo script and judge Q&A

The moment that wins is the payout landing on a phone everyone can see, at the instant the bayou line turns red. Expo-style table judging rarely gives 4 minutes, so the 90-second version is the default.

**Set-up:** the map on the laptop; the phone view mirrored next to it; Start and Reset buttons visible; the fallback video open in another tab.

## 90-second version

| Time | Beat |
| --- | --- |
| 0:00 to 0:15 | "Maria rents in Meyerland. Federal flood claims take weeks. She needs money in the first 72 hours." |
| 0:15 to 0:35 | Tap a demo gauge button (for example Brays Bayou). Show the quote: probability, premium, band. Buy on the phone; the policy appears in the wallet. |
| 0:35 to 1:10 | Start the Harvey replay. Bayous rise, the map turns red, and the phone shows +$500 and "PAID". |
| 1:10 to 1:30 | Pool page: reserve used, the bond absorbs the rest. "Priced from 30 years of gauge data in Tiger Data, settled on Solana in seconds." |

## 4-minute version

| Time | Beat |
| --- | --- |
| 0:00 to 0:30 | The gap, told through Maria. One sentence on Atlas. |
| 0:30 to 1:15 | The judge picks one of the 4 demo gauges. Quote with probability, premium, band and the history behind it. Buy on the phone; show the non-transferable policy. Say: "Waiting period is off in demo mode." |
| 1:15 to 2:30 | Harvey replay, about 90 seconds. Map turns red, waves trigger, payouts land in three wallets, the phone shows PAID. Pool page: reserve exhausted, bond NAV drops. |
| 2:30 to 3:00 | Verify one payout: Memo hash matches the recorded reading. |
| 3:00 to 3:30 | Numbers: loss ratio, capital needed for a Harvey-scale event on the simulated book, Tiger compression ratio. |
| 3:30 to 4:00 | Limitations in one breath (basis risk, licensing), then the close. |

## Demo rules

- Only offer the 4 gauges that cross their trigger in the replay window. Never invite judges to name any bayou.
- Press Reset before every judge group. Run one full replay 20 minutes before judging.
- Pre-fund every wallet; keep the phone's Phantom in Testnet Mode with screen lock off.
- Never debug in front of judges: switch to the fallback video within 15 seconds of anything breaking.

## Judge Q&A

| Question | Answer |
| --- | --- |
| Your bot decides to pay. What does the chain add? | Payment can't be separated from the policy: purchase is one atomic transaction. Every payout carries a Memo hash of the reading it acted on, so anyone can audit it. Pool solvency is public in real time. A Solana program enforcing the rule itself is the production step. |
| Which numbers are real? | On-chain panel: three real devnet policies and real vault balances. Simulated panel: a 2,000-policy book for catastrophe numbers, labelled on screen. |
| What happens when the pool runs short? | Reserve first, then the catastrophe bond, then every policy in a wave is cut by the same pay factor. |
| What if the gauge triggers but my street stayed dry? | Basis risk, the core trade-off of parametric cover. We trade precision for speed and keep payouts small and fixed. Rainfall and multi-gauge triggers are next. |
| Is this legal? | Selling insurance needs a licence, and the bond token is likely a security. Atlas is the engine an insurer, a city programme or a nonprofit would run. |
| Why blockchain? | Payout in seconds to anyone with a phone wallet, policies nobody can resell, evidence anyone can check, and public solvency. |
| Can you fake the oracle? | In this build the bot reads our database and the replay comes from our server; we say so. With Switchboard the live feed reads USGS directly. Production would use several sources. |
| Why not buy cover when a storm is coming? | 7-day waiting period, and sales freeze while NWS has an active flood watch or warning at the gauge. |
| What if a gauge fails mid-flood? | Policy terms name a fallback: the nearest working gauge or a rainfall trigger. |
| How did you price it? | Declustered event frequency from decades of gauge history, Poisson payout probability, loading plus a capital charge, bootstrap confidence band. |
| Why mark the policy paid instead of burning it? | So the holder keeps visible proof. It still pays once per term because the bot checks the status. |
| How do you stop double payment if the bot crashes? | It checks for an existing payout for that policy and run before sending, and records every signature. |
