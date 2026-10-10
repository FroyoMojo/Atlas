# Atlas: parametric flood protection for Houston

> **Status: planning.** There is no code yet. This repo currently holds the build plan and the team notes. The repo is named `Rug-Radar` after an earlier idea; the project is **Atlas**.

Built for [CodeRED: Orion](https://codered-orion-ccs.devpost.com/) by a team of two: Ezekiel (data and risk) and Person B (chain and product).

## The pitch

Maria rents in Meyerland. When Brays Bayou crosses flood stage, $500 lands on her phone before the water goes down. That pays for a hotel, food and a missed shift in the first 72 hours, when nothing else pays.

Atlas sells a small policy tied to the nearest stream gauge. If that gauge crosses a set flood level during the term, every covered household near it gets a fixed payout automatically. There is no claim form and no adjuster. Atlas covers immediate needs only. It does not pay for property damage or replace flood insurance.

## How it works

1. Gauge readings (USGS) stream into **Tiger Data** hypertables. Decades of history are used to price each policy.
2. When a gauge's last two readings cross its trigger level, the engine records a trigger event.
3. A payout bot pays every active policy on that gauge in test stablecoin (`aUSD`) on **Solana devnet**. It writes a Memo hash of the reading it acted on and marks the policy `paid`.
4. Losses come out of a premium reserve first, then a catastrophe bond token whose NAV falls.
5. For the demo, a **Harvey replay** plays the 2017 flood peak through the full pipeline in about 90 seconds.

See the architecture diagram in [the build plan](docs/plan/Atlas_Build_Plan_v2.pdf), section 2.

## Tracks

| Track | How Atlas uses it |
| --- | --- |
| Best Overall | The full product |
| Best Pitch/Demo | Business case: an engine for insurers, city programmes and nonprofits |
| Best Environment Hack | Climate adaptation that protects a local community from flooding |
| Best Use of Solana | Non-transferable Token-2022 policies, atomic purchase transaction, Squads multisig vault, Memo evidence, catastrophe bond token |
| Best Use of Tiger Data | Hypertables, continuous aggregates, compression, trigger detection, pricing, replay engine |
| Best Use of Vultr | Hosts the API, replay feed and dashboard |
| Best Domain Name from GoDaddy Registry | Domain for the hosted site |

## Repo layout (planned)

```
/data     ingestion, backfill cache, replay streamer (Python)
/engine   FastAPI: triggers, pricing, stress tests, purchase transactions
/chain    aUSD, policy mints, Squads vault, payout bot (TypeScript)
/web      dashboard (Next.js or Vite + React)
/docs     plan, API contract, decisions, judging criteria
```

## Docs

| File | What it is |
| --- | --- |
| [docs/handoff.md](docs/handoff.md) | **Start here.** Current status, who owns what, next steps |
| [docs/plan/Atlas_Build_Plan_v2.pdf](docs/plan/Atlas_Build_Plan_v2.pdf) | The build plan (LaTeX source alongside). v1 kept for reference. |
| [docs/api.md](docs/api.md) | API contract between the engine and the dashboard |
| [docs/decisions.md](docs/decisions.md) | Hour 0 to 1.5 checks and the fallback chosen for each |
| [docs/criteria.md](docs/criteria.md) | Hackathon rules, tracks and judging criteria |
| [docs/demo.md](docs/demo.md) | 90-second and 4-minute demo scripts, judge Q&A |
| [.env.example](.env.example) | Environment variables the services will need |

## Setup

Not written yet. It will cover Tiger Data, Solana devnet wallets, the `aUSD` mint and how to run and reset the Harvey replay.

## Limitations (short version)

- **Basis risk:** payouts follow a gauge, not your property.
- **Devnet and test money only.** Not a licensed insurance product; the bond token would likely be a security.
- **Off-chain decision:** the payout bot decides to pay. The Memo makes that decision auditable, not enforced.
- **Simulated book:** catastrophe numbers come from a simulated 2,000-policy portfolio. Only the 3 demo policies are real on-chain.

The full list is in the build plan, section 13.
