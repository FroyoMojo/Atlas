# Atlas: parametric flood protection for Houston

> **Status: building to plan v3.1.** The chain service, payout bot and dashboard (`chain/`, `web/`) are built and tested on a local validator, and laptop hosting (`deploy/`) is ready. Devnet setup is done. The engine's schema and read API (`engine/`) are built and tested. The replay streamer replays real Harvey data. Next: the public URL, the phone test, and Ezekiel's final gauges and triggers. The GitHub repo was renamed from `Rug-Radar` to **Atlas**.

Built for [CodeRED: Orion](https://codered-orion-ccs.devpost.com/) by Ezekiel (data and risk) and Jesse (chain, product and hosting).

## The pitch

Maria rents in Meyerland. When her bayou crosses flood stage, $500 lands on her phone before the water goes down. That pays for a hotel, food and a missed shift in the first 72 hours, when nothing else pays.

Atlas sells a small policy tied to the nearest stream gauge. If that gauge crosses a set flood level during the term, every covered household near it gets a fixed payout automatically. There is no claim form and no adjuster. Atlas covers immediate needs only. It does not pay for property damage or replace flood insurance.

## How it works

1. Gauge readings (USGS) go into **Tiger Data** hypertables. Decades of history price each policy.
2. When a gauge has two consecutive readings at or above its trigger level, the engine opens an event and stores a hash of the exact reading.
3. The first event in a run opens a **storm**. A payout bot pays every active policy on that gauge an interim share in test stablecoin (`aUSD`) on **Solana devnet**, writes the evidence hash in a Memo, and marks the policy `PAID`.
4. When the storm closes, everyone gets a true-up to the same final share. Losses come out of a premium reserve first, then a catastrophe bond token whose NAV falls. Every money movement is a ledger row that reconciles with the chain after each run.
5. For the demo, a **Harvey replay** plays the 2017 flood peak through the full pipeline in about 90 seconds.

Architecture diagram: [build plan v3.1](docs/plan/Atlas_Build_Plan_v3.1.pdf), section 2.

## Tracks

| Track | How Atlas uses it |
| --- | --- |
| Best Overall | The full product |
| Best Pitch/Demo | Business case: an engine for insurers, city programmes and nonprofits |
| Best Environment Hack | Climate adaptation that protects a local community from flooding |
| Best Use of Solana | Non-transferable Token-2022 policies, atomic purchase, Squads multisig vault, payout bot with intents, Memo evidence, catastrophe bond token |
| Best Use of Tiger Data | Hypertables, continuous aggregates, columnstore, event and storm state, money ledger, pricing scenarios, replay engine |
| Best Domain Name from GoDaddy Registry | Domain for the hosted site |

## Repo layout

```
chain/    Solana side (TypeScript): setup scripts, chain service, payout bot      [built]
web/      Dashboard and phone view (Vite + React)                              [built]
deploy/   Laptop hosting guide (gateway code in chain/src/gateway)              [built]
tools/    g2_storm.py: opens a storm directly (true-up rehearsal)              [built]
docs/     Plan, API contract, evidence format, decisions, demo, guides
data/     USGS loader: gauges, annual peaks, Harvey window (Python)            [built; live poller: Ezekiel]
engine/   FastAPI over Tiger: schema, read API, pricing, replay streamer, storms  [built]
```

## Docs

| File | What it is |
| --- | --- |
| [docs/handoff.md](docs/handoff.md) | **Start here.** Status, owners, next steps |
| [docs/plan/Atlas_Build_Plan_v3.1.pdf](docs/plan/Atlas_Build_Plan_v3.1.pdf) | The current build plan (LaTeX source alongside; older versions in `docs/plan/archive/`) |
| [docs/api.md](docs/api.md) | API contract, who writes which table, ledger entries, reconciliation |
| [docs/evidence.md](docs/evidence.md) | Canonical evidence preimage, code in both languages, test vector |
| [docs/decisions.md](docs/decisions.md) | Gate G1 checks and every decision with its reason |
| [docs/demo.md](docs/demo.md) | 90-second and 4-minute demo scripts, judge Q&A |
| [docs/phone-test.md](docs/phone-test.md) | Phantom test that picks purchase Flow A or B |
| [docs/criteria.md](docs/criteria.md) | Hackathon rules, tracks and judging criteria |
| [deploy/WINDOWS.md](deploy/WINDOWS.md) | **Demo laptop (Windows) setup, step by step** |
| [deploy/README.md](deploy/README.md) | Hosting on the demo laptop: gateway, Cloudflare Tunnel, domain (macOS/Linux) |

## Run

- Engine (FastAPI, schema, replay streamer): [engine/README.md](engine/README.md)
- USGS loader (gauges, peaks, Harvey window): [data/README.md](data/README.md)
- Chain service and payout bot: [chain/README.md](chain/README.md)
- Dashboard and phone view: [web/README.md](web/README.md)
- Hosting: [deploy/README.md](deploy/README.md)
- Configuration: [.env.example](.env.example) (server) and [web/.env.example](web/.env.example)

## Limitations (short version)

- **Basis risk:** payouts follow a gauge, not your property.
- **Devnet and test money only.** Not a licensed insurance product; the bond token would likely be a security.
- **Off-chain decision:** the payout bot decides to pay. The Memo makes that decision auditable, not enforced.
- **No cash-out:** turning aUSD into money in a bank account is out of scope.
- **Simulated book:** catastrophe numbers come from a simulated 2,000-policy portfolio; on-chain capital is seeded test money.

The full list is in the build plan, section 13.
