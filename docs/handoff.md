# Handoff

Read this first when you pick up the repo. Update the **Status** and **Next steps** sections whenever you stop working.

## Status (Oct 10, 2026)

- Idea chosen: **Atlas**, parametric flood protection for Houston.
- Build plan v2 written and red-teamed: [docs/plan/Atlas_Build_Plan_v2.pdf](plan/Atlas_Build_Plan_v2.pdf).
- No code yet. No accounts created yet.

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
- [ ] Jesse: create the `aUSD` mint, fund the wallets, create the 2-of-3 Squads multisig, run the Token-2022 extension test.
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
