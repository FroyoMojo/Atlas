# Atlas: emergency money when your neighborhood floods

**Live: [atlasflood.us](https://atlasflood.us)** · Solana devnet, test dollars · Built for [CodeRED: Orion](https://codered-orion-ccs.devpost.com/) by Jesse (finance, chain, product, hosting) and Ezekiel (data and risk)

When the river gauge next to your Houston neighborhood reaches the official flood level, Atlas sends you $500 in seconds, with a public receipt of the reading that triggered it. No claim, no adjuster, no waiting weeks. The demo replays Hurricane Harvey's real 2017 river data, five days in about a minute.

## The idea

Maria rents in Meyerland. Her renters' insurance doesn't cover flooding, and aid takes weeks. When Brays Bayou crosses flood level, $500 lands on her phone before the water goes down: a hotel room, food and a missed shift in the first nights, when nothing else pays.

Atlas covers immediate needs only. It is not property insurance and does not replace it.

## How it works

1. **Protect your address.** Type a ZIP or pick a neighborhood. Protection is $500 for 90 days, priced from that river's own record (about $20 a quarter in Meyerland, $58 in Spring). One policy per household, and a 7-day wait so nobody buys with the storm on the radar. Sales also close when the National Weather Service issues a flood watch.
2. **The river decides.** USGS gauges report every 15 minutes into **Tiger Data**. Two readings in a row at or above the NWS moderate flood level (42 ft on Brays Bayou) open an event, and the engine stores a SHA-256 hash of that exact reading.
3. **Money in seconds.** A payout bot sends test dollars (`aUSD`) to every protected wallet on that gauge on **Solana devnet**, with the evidence hash in a Memo. Anyone can check a payout in their browser against the recorded reading.
4. **Readiness, in public.** Every market shows how much of its promised $500 is funded right now ("if it flooded this minute you would get $169"). Sponsors can close the gap from a phone, and the price falls as community money fills the pool.
5. **Money in layers.** The community fund (premiums, a seed reserve, donations) pays first. A catastrophe bond takes only the rare, big years. Anything beyond both is shared equally. A Harvey-sized loss on a simulated 2,000-policy book ($837k) is paid in full.
6. **Books match the chain.** Every money movement is a double-entry ledger row in Tiger and is reconciled against on-chain balances after each run.

## Where to look in the code

| What | Where |
| --- | --- |
| Trigger rule, replay and storms | [`engine/app/replay.py`](engine/app/replay.py) |
| Pricing, readiness, capital and the loss waterfall | [`engine/app/pricing.py`](engine/app/pricing.py), [`engine/app/markets.py`](engine/app/markets.py) |
| Sales freeze on NWS watches | [`engine/app/freeze.py`](engine/app/freeze.py) |
| Evidence hash, same bytes in Python, TypeScript and the browser | [`docs/evidence.md`](docs/evidence.md), [`engine/app/evidence.py`](engine/app/evidence.py), [`chain/src/lib/memo.ts`](chain/src/lib/memo.ts), [`web/src/evidence.ts`](web/src/evidence.ts) |
| Payout bot (interim payment, then true-up) | [`chain/src/bot/payout-bot.ts`](chain/src/bot/payout-bot.ts) |
| Non-transferable Token-2022 policies, atomic purchase | [`chain/src/lib/policy.ts`](chain/src/lib/policy.ts), [`chain/src/server/index.ts`](chain/src/server/index.ts) |
| Squads 2-of-3 vault, bond token, donations | [`chain/src/lib/squads.ts`](chain/src/lib/squads.ts), [`chain/src/lib/bond.ts`](chain/src/lib/bond.ts), [`chain/src/lib/donation.ts`](chain/src/lib/donation.ts) |
| Ledger and reconciliation | [`chain/src/lib/ledger.ts`](chain/src/lib/ledger.ts), [`docs/api.md`](docs/api.md) |
| Verify a payout in the browser | [`web/src/useVerify.ts`](web/src/useVerify.ts) |
| Tiger schema (hypertables, continuous aggregates, columnstore) | [`engine/sql/schema.sql`](engine/sql/schema.sql) |
| USGS loader and the risk studies behind the numbers | [`data/`](data/README.md) |
| Tests | [`engine/tests/`](engine/tests), [`data/tests/`](data/tests) |

## Tracks

| Track | How Atlas uses it |
| --- | --- |
| Best Overall | The full product, live |
| Best Pitch/Demo | Harvey replay with live payouts and the readiness meter |
| Best Environment Hack | Climate adaptation: money for the first nights of a flood, for people flood insurance misses |
| Best Use of Solana | Non-transferable Token-2022 policies, one-transaction purchase, Squads multisig vault, payout bot with Memo evidence, catastrophe bond token |
| Best Use of Tiger Data | 6.5M+ readings in hypertables, 6.5x columnstore compression, continuous aggregates, event and storm state, a double-entry money ledger, the replay engine |
| Best Domain Name from GoDaddy Registry | `atlasflood.us` |
| Best Use of Vultr | The whole stack (engine, chain service, payout bot, web app) on one Vultr server behind Caddy |

## Repo layout

```
engine/   FastAPI over Tiger: schema, read API, pricing, readiness, replay, storms
chain/    Solana side (TypeScript): chain service, payout bot, gateway, setup scripts
web/      The app at atlasflood.us (Vite + React): map, buy, my protection, markets, invest, proof
data/     USGS loader and the risk studies (pricing, grades, catastrophe bond, Harvey)
deploy/   Hosting: deploy/vultr (live) and a laptop fallback
tools/    Rehearsal helper for the payout true-up
docs/     Design docs and the team's hackathon notes (below)
```

## Run it

- Engine: [engine/README.md](engine/README.md)
- Data loader: [data/README.md](data/README.md)
- Chain service and payout bot: [chain/README.md](chain/README.md)
- Web app: [web/README.md](web/README.md)
- Hosting: [deploy/vultr/README.md](deploy/vultr/README.md) (laptop fallback: [deploy/README.md](deploy/README.md), [deploy/WINDOWS.md](deploy/WINDOWS.md))
- Configuration: [.env.example](.env.example) and [web/.env.example](web/.env.example)

## Docs

**Design**

| File | What it is |
| --- | --- |
| [docs/plan/Atlas_Build_Plan_v3.1.pdf](docs/plan/Atlas_Build_Plan_v3.1.pdf) | The build plan we started from: architecture, money model, limitations (older versions in `docs/plan/archive/`) |
| [docs/decisions.md](docs/decisions.md) | Every decision since the plan, with its reason |
| [docs/readiness.md](docs/readiness.md) | Readiness markets: spec, demo runbook, what we may claim |
| [docs/api.md](docs/api.md) | API contract, who writes which table, ledger entries, reconciliation |
| [docs/evidence.md](docs/evidence.md) | The evidence hash format, with a test vector |
| [docs/numbers.sql](docs/numbers.sql) | The queries behind every number in the pitch |

**Hackathon notes** (how we worked; kept as a record)

| File | What it is |
| --- | --- |
| [docs/devpost.md](docs/devpost.md) | Devpost submission text |
| [docs/talking-points.md](docs/talking-points.md) | Judging walkthrough, Q&A, video script |
| [docs/demo.md](docs/demo.md) | Earlier demo scripts |
| [docs/handoff.md](docs/handoff.md) | Status and owners between shifts |
| [docs/checklist.md](docs/checklist.md), [docs/morning.md](docs/morning.md) | Submission-day checklist and runbook |
| [docs/phone-test.md](docs/phone-test.md) | The Phantom test that picked the purchase flow |
| [docs/criteria.md](docs/criteria.md) | Hackathon rules and judging criteria |

## Limitations

- **Basis risk:** payouts follow a gauge, not your house. A street can flood while its gauge stays below the line, and the reverse.
- **Devnet and test money only.** This is not a licensed insurance product, and the bond token would likely be a security. Going live needs a licensed partner.
- **Off-chain decision:** the payout bot decides to pay. The Memo makes that decision checkable, not enforced; an on-chain program and oracle are the next step.
- **Simulated pieces:** catastrophe numbers come from a simulated 2,000-policy book, and the bond pooled across seven markets is a simulation. Only the four Houston areas are live.
- **No cash-out:** turning aUSD into money in a bank account is out of scope.
