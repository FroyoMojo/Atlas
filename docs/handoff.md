# Handoff

Read this first when you pick up the repo. Update the **Status** and **Next steps** sections whenever you stop working.

## Status (Oct 10, 2026)

- Idea chosen: **Atlas**, parametric flood protection for Houston.
- Build plan **v3.1** is current: [docs/plan/Atlas_Build_Plan_v3.1.pdf](plan/Atlas_Build_Plan_v3.1.pdf). Code and docs are aligned to it; its fix list (V1 to V17) matches [decisions.md](decisions.md).
- **Jesse's side built to v3** and tested end to end on a local validator:
  - [`chain/`](../chain/README.md): chain service (Flow A and B purchase, bond, reset with refill, balances), storm payout bot (interim + true-up, intents, crash recovery), ledger writes.
  - [`web/`](../web/README.md): map, gauge, pool, verify, phone view with the payout banner, admin-gated Start/Reset; mock engine in v3 shapes.
- **Not done yet:** Ezekiel's engine (`/data`, `/engine`); running the chain setup on real devnet; hosting on Vultr; the domain.

## Key times

| When | What |
| --- | --- |
| Oct 10, 1:00 pm CDT | Hacking starts (Hour 0) |
| Hour 1.5 | Gate G1: every check in `decisions.md` answered |
| Hour 5 | Gate G2: a replay run pays a real devnet policy end to end |
| Hour 16 | Gate G3: feature freeze; replay runs twice on the hosted URL |
| Hour 19.5 | Target submission |
| Oct 11, 1:00 pm CDT | Devpost deadline (Hour 24) |

## Who owns what

| Person | Owns |
| --- | --- |
| Ezekiel (Person A, data and risk) | Tiger schema, ingestion and cache, trigger logic, replay engine, pricing, simulated book, stress tests, bond maths, FastAPI read endpoints. Every number on stage. |
| Jesse (Person B, chain and product) | `aUSD`, policy mints, atomic purchase, Squads vault, payout bot, Memo evidence, bond token, dashboard, Vultr deploy, domain. The live demo flow. |
| Both | Integration at each gate, pitch, Q&A, fallback video, Devpost write-up |

## Rules we agreed

- If something blocks you for 45 minutes, say so and switch to its fallback (plan section 12).
- Optional upgrades (Switchboard, Squads spending limit, Blink) get 1 hour each, only after Gate G2. Miss the hour, drop it.
- Nothing on stage calls USGS live. Everything reads from Tiger or `/data/cache/`.
- Never commit secrets. Keys live in `.env`, which is git-ignored.
- Press **Reset** before every judge group.

## Next steps

- [ ] Both: do the pre-flight checklist (plan section 3).
- [ ] Both: confirm the API shapes in [api.md](api.md).
- [ ] Ezekiel: pick 6 to 10 gauges with real USGS site numbers and start caching raw data.
- [ ] Jesse: devnet SOL via faucet.solana.com, then the devnet setup; commit `chain/state/devnet.json` ([deploy/README.md](../deploy/README.md) step 0).
- [ ] Jesse: Vultr + domain + `setup-server.sh` + `deploy.sh` ([deploy/README.md](../deploy/README.md) steps 1 to 5).
- [ ] Jesse: phone test, Flow A or B ([phone-test.md](phone-test.md)).
- [ ] Jesse: once Zeke names the 4 demo gauges, `npm run migrate` and `npm run precreate` on the server.
- [ ] Ezekiel: schema from plan v3 6.2; `gauge_events.preimage`/`evidence_hash` per [evidence.md](evidence.md) (check the test vector).
- [ ] Ezekiel: set `storms.f_int` at storm open and `f_fin` + `closed` at close; the bot pays from those.
- [ ] Ezekiel: `GET /replay/status`; `/replay/start` records opening balances from `GET /chain/balances`; `/replay/reset` calls `POST /chain/reset` with `X-Admin-Token`.
- [ ] Both: G2 with [`tools/g2_storm.py`](../tools/g2_storm.py) (ready; tested locally with interim 0.6 and true-up 1.0).
- [ ] Both: fill in [decisions.md](decisions.md) by Hour 1.5.

## Accounts and addresses

Fill these in as they are created. Public addresses only; never paste private keys here.

| Item | Value |
| --- | --- |
| Hosted URL | |
| Domain | |
| Vultr instance IP | |
| Tiger Cloud service | (connection string in `.env` only) |
| `aUSD` mint | |
| Squads multisig | |
| Squads vault | |
| Bot public key | |
| Bond token mint | |
| Demo policyholder wallets | |
| Investor wallet | |
