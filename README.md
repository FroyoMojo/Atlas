# Atlas: parametric flood protection for Houston

> **Status: building (plan v3).** Chain service, payout bot and dashboard are in `chain/` and `web/`; the engine (`data/`, `engine/`) is next. The repo is named `Rug-Radar` after an earlier idea; the project is **Atlas**.

Built for [CodeRED: Orion](https://codered-orion-ccs.devpost.com/) by a team of two: Ezekiel (data and risk) and Jesse (chain and product).

## The pitch

Maria rents in Meyerland. When Brays Bayou crosses flood stage, $500 lands on her phone before the water goes down. That pays for a hotel, food and a missed shift in the first 72 hours, when nothing else pays.

Atlas sells a small policy tied to the nearest stream gauge. If that gauge crosses a set flood level during the term, every covered household near it gets a fixed payout automatically. There is no claim form and no adjuster. Atlas covers immediate needs only. It does not pay for property damage or replace flood insurance.

## How it works

1. Gauge readings (USGS) stream into **Tiger Data** hypertables. Decades of history are used to price each policy.
2. When a gauge's last two readings cross its trigger level, the engine records a trigger event.
3. The first event in a run opens a **storm**. A payout bot pays every active policy on that gauge an interim share in test stablecoin (`aUSD`) on **Solana devnet**, writes a Memo hash of the exact reading it acted on, and marks the policy `PAID`.
4. When the storm closes, everyone gets a true-up to the same final share. Losses come out of a premium reserve first, then a catastrophe bond token whose NAV falls. Every money movement is a ledger row that reconciles with the chain.
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
| [docs/plan/Atlas_Build_Plan_v3.1.pdf](docs/plan/Atlas_Build_Plan_v3.1.pdf) | The current build plan (LaTeX source alongside). v1 to v3 kept for reference. |
| [docs/api.md](docs/api.md) | API contract, who writes which table, ledger entries, reconciliation |
| [docs/evidence.md](docs/evidence.md) | Canonical evidence preimage, code in both languages, test vector |
| [docs/decisions.md](docs/decisions.md) | Hour 0 to 1.5 checks and the fallback chosen for each |
| [docs/criteria.md](docs/criteria.md) | Hackathon rules, tracks and judging criteria |
| [docs/demo.md](docs/demo.md) | 90-second and 4-minute demo scripts, judge Q&A |
| [.env.example](.env.example) | Environment variables the services will need |

## Setup

- Chain service and payout bot: [chain/README.md](chain/README.md)
- Dashboard and phone view: [web/README.md](web/README.md)
- Deploy to Vultr: [deploy/README.md](deploy/README.md); phone test: [docs/phone-test.md](docs/phone-test.md)
- G2 storm script: [tools/g2_storm.py](tools/g2_storm.py)
- Engine: not written yet

## Limitations (short version)

- **Basis risk:** payouts follow a gauge, not your property.
- **Devnet and test money only.** Not a licensed insurance product; the bond token would likely be a security.
- **Off-chain decision:** the payout bot decides to pay. The Memo makes that decision auditable, not enforced.
- **No cash-out:** turning aUSD into money in a bank account is out of scope.
- **Simulated book:** catastrophe numbers come from a simulated 2,000-policy portfolio. Only the 3 demo policies are real on-chain.

The full list is in the build plan, section 13.
