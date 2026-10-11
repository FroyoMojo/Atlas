# Handoff

Read this first when you pick up the repo. Update the **Status** and **Next steps** sections whenever you stop working.

## Status (Oct 10, about 8 pm CDT, Hour 7: after G2 and a full repo audit)

- Build plan **v3.1** is current: [docs/plan/Atlas_Build_Plan_v3.1.pdf](plan/Atlas_Build_Plan_v3.1.pdf). Its fixes (V1 to V17) are listed in the plan; the decisions that resulted are in [decisions.md](decisions.md).
- **Built and tested:**
  - [`chain/`](../chain/README.md): chain service (purchase Flow A and B, bond, reset with refill, balances), storm payout bot (interim and true-up, intents, crash recovery), ledger writes.
  - [`web/`](../web/README.md): map, gauge, pool, verify and phone view with the payout banner; Start/Reset behind the admin token.
  - [`engine/`](../engine/README.md): Tiger schema (one command), every read endpoint, Start/Reset, and the replay streamer (events, storms, `f_int`/`f_fin`, sales freeze), tested on real Harvey data.
  - [`data/`](../data/README.md): Ezekiel's pipeline (USGS and NWS backfill, F11, triggers, event counts, simulated book).
  - [`deploy/vultr/`](../deploy/vultr/README.md): **current hosting**, the Vultr server behind Caddy at `atlasflood.us`; `npm run stack` runs engine, chain service, bot and gateway under systemd. The laptop + Cloudflare Tunnel guides ([deploy/README.md](../deploy/README.md), [WINDOWS.md](../deploy/WINDOWS.md)) are the fallback.
  - [`tools/g2_storm.py`](../tools/g2_storm.py): opens a storm directly (true-up rehearsal); tested with interim 0.6 and true-up 1.0.
- **Devnet:** set up and checked; addresses below. RPC: Helius devnet (key in `.env` only, never in the web bundle).
- **G2 passed on devnet (Oct 10, about 7 pm CDT)**, with a local TimescaleDB standing in for Tiger and real Harvey data: Reset refilled vault and float, holder1 bought a Brays policy (engine-priced), the replay crossed Brays and the bot paid 500 aUSD with the evidence Memo ([payout tx](https://explorer.solana.com/tx/3cfDne5GMs4ruDHkBP6AfqfotThG7VLM1xZJUE8yRdEd819k1SXr7NyUhA1XFYkPAymwPZVbDBSe5UGTtVfHKKwz?cluster=devnet)); the pool reconciled. Reset, then a second run: paid again, reconciled again.
- **Data side (Ezekiel, Oct 10, about Hour 9):** Tiger holds the full 2007 to 2026 history (6.5M readings, hourly aggregate, columnstore 6.5x), 10 gauges with NWS **moderate** flood-stage triggers, annual peaks, `record_start` per gauge from USGS datum flags ([data/f11_decisions.json](../data/f11_decisions.json)), yearly event counts (`gauge_rates`) and the simulated 2,000-policy book. `demo_ready`: Brays 08075000, Buffalo at Piney Point 08073700, Cypress 08069000, Spring Ck 08068500 (Greens dropped: it triggers about once a year). Policy term is 90 days; `/quote` prices with the higher of the peak and event rates; capital K is measured against the model mean. The schema was migrated to v3.1 in place (`data/migrate_v31.py`). **For Jesse:** set `TERM_DAYS=90` in the chain `.env`; quotes for $500 are about $22 (Brays), $36 (Piney Point), $32 (Cypress), $58 (Spring Ck), so `FALLBACK_PREMIUM=48` is only a fallback; the replay now streams only the four demo gauges (`REPLAY_DEMO_ONLY`); `docs/numbers.sql` reproduces the slide numbers (`python data/run_numbers.py`). Pipeline: [data/README.md](../data/README.md).
- **Audit (Oct 10, 8 pm):** 8 demo-affecting bugs and about 10 smaller ones fixed (see [decisions.md](decisions.md), "Audit fixes"), all re-tested.
- **Not done:** G2 repeat on Tiger with the chain service, public URL and domain (atlasflood.us), phone test, slides, the live poller (optional).
- Commits go straight to `main` (no pull requests).

## Key times

| When | What |
| --- | --- |
| Oct 10, 1:00 pm CDT | Hacking started (Hour 0) |
| Open | Gate G1: every check in `decisions.md` answered; only the phone test is left |
| Hour 6.5 (7:30 pm) | Gate G2: a storm pays a real devnet policy; ledger and chain agree. **Passed about 7 pm** |
| Hour 16 (5:00 am) | Gate G3: feature freeze; start, run, reset, run again on the hosted URL |
| Hour 19.5 (8:30 am) | Target submission |
| Oct 11, 1:00 pm CDT | Devpost deadline (Hour 24) |

## Who owns what

| Person | Owns |
| --- | --- |
| Ezekiel (data and risk) | Tiger schema, ingestion and cache, event and storm logic, `f_int` and `f_fin`, replay and run clock, pricing, scenarios, simulated book, ledger reads and reconciliation, FastAPI (read-only), NWS freeze. Every number on stage. |
| Jesse (chain, product, hosting) | Chain service and all signing, aUSD and policy mints, Squads vault, payout bot, Memo evidence, ledger writes, dashboard and phone view, laptop hosting, Cloudflare Tunnel, domain. The live demo flow. |
| Both | Gates, pitch, Q&A, fallback video, Devpost write-up |

## Rules we agreed

- Blocked for 45 minutes: say so and switch to the fallback (plan section 12).
- Upgrades: at most one after G2 (Solana Pay QR, only with Flow A). Switchboard, spending limit and Blink are cut.
- Nothing on stage calls USGS live. Everything reads from Tiger or `/data/cache/`.
- Python never builds or signs a Solana transaction.
- Never commit secrets. Keys live in `secrets/` and `.env`, both git-ignored.
- Press **Reset** before every judge group and check the reconciliation badge is green.

## Next steps

- [x] Jesse: devnet setup done (aUSD, wallets, 2-of-3 vault, bond mint, Token-2022 and Squads checks on real devnet); addresses below.
- [x] Jesse: Helius devnet RPC in `.env` (`SOLANA_RPC_URL`); optional `WEB_RPC_URL` for the browser.
- [x] Shared `ADMIN_TOKEN` chosen (in `.env` only; also in the laptop kit).
- [x] Domain `atlasflood.us` and `www` point at the Vultr server (45.32.196.119).
- [ ] Vultr server: setup, secrets and `.env`, `deploy.sh`, then `npm run migrate`, precreate and `npm run preflight` until READY ([deploy/vultr/README.md](../deploy/vultr/README.md)). **`npm run migrate` on Tiger is required**: it adds `runs.reset_wall`, without which Start, Reset and purchase booking fail.
- [ ] Fallback only: Zeke's Windows laptop with the laptop kit ([deploy/WINDOWS.md](../deploy/WINDOWS.md)), trycloudflare URL, no DNS change.
- [ ] Jesse: phone test, Flow A or B ([phone-test.md](phone-test.md)); record #10 and #11 in [decisions.md](decisions.md).
- [x] Demo gauges: 08075000, 08073700, 08069000, 08068500 (precreate: `npm run precreate -- 08075000,08073700,08069000,08068500 8`).
- [x] Schema written: `cd chain && npm run migrate` applies the engine and chain tables (run it on Tiger once it exists; no psql needed).
- [x] Ezekiel: Tiger loaded (gauges, peaks, history, triggers, event counts, simulated book); economics reviewed.
- [x] Replay streamer with events, storms, `f_int`/`f_fin` and the sales freeze (`engine/app/replay.py`); tested on real Harvey data.
- [x] Ezekiel: demo gauges and moderate triggers set ([data/README.md](../data/README.md)).
- [ ] Ezekiel: re-run `python data/run_numbers.py` at the moderate triggers and send the capital numbers for the Devpost text (it still quotes the minor-trigger figures); confirm the reading count (5.8M in decisions.md vs 6.5M here).
- [x] `GET /replay/status`; `/replay/start` records opening balances from `GET /chain/balances`; `/replay/reset` calls `POST /chain/reset` with `X-Admin-Token`.
- [ ] Jesse: run the dashboard with `VITE_USE_MOCKS=false` once Tiger has data.
- [x] G2 on devnet (local DB stand-in for Tiger), see Status.
- [ ] Both: repeat on Tiger with the final demo gauges: `npm run stack`, Reset, buy, Start.

## Accounts and addresses

Fill these in as they are created. Public addresses only; never paste private keys here.

| Item | Value |
| --- | --- |
| Hosted URL | **https://atlasflood.us** (live Oct 11, about Hour 17: Caddy on Vultr, valid certificate, `/chain/reset` returns 403 from outside, engine and chain healthy) |
| Vultr server | `45.76.239.177` (Ubuntu, 2 GB+, Dallas); Caddy -> gateway :8080 -> engine, chain, bot under systemd (`atlas-stack`); redeploy with `bash /opt/atlas/deploy/vultr/deploy.sh` |
| Domain | `atlasflood.us` (Porkbun, via the MLH GoDaddy Registry offer; expires 2027-10-11). DNS: A records (root and www) point to the Vultr IP `45.76.239.177` |
| Tunnel URL (trycloudflare) | |
| Tiger Cloud service | (connection string in `.env` only) |
| `aUSD` mint | `8rcNwXHnYbUG9Nm9gb3dXEJujPXsdkQAnCiL8UbnBbxo` |
| Squads multisig | `3EWJH9r4uo9AoV8LiDRthFQZ6PpWx89c9SqWFuwkaKoU` (2-of-3, 60 s time lock) |
| Squads vault | `AC2BQCvsmLeaYSwWwQw6PvU7GN7y2q6bDNjLfx2C265o` |
| Bot public key | `4XfPahYq4Yq1n89tECuMC7fzxjRBwnRkFjKqpJa9BA66` |
| Bond token mint | `CkLe9NUaKPLAdhHM3dZFDVdqWuNena2ow5zHKdDrtc8T` |
| Demo policyholder wallets | Jesse phone (Phantom): `72t74q3nTQDM6t9CqNMDhSiL9ykzxPnoQKudDs3Bu5co`; backups holder1 `GX5R6aJMni9UVmCg6EtsWKzrG5h2fVitn6U2X1YwBtDL`, holder2 `7e1DzCBHLDYxGaCQWQ1qWTVUn2MdFmqrupJfcuDxt6Mp`, holder3 `2JKWpyXV714myXxfavMmHmj5BqjZ3FGA6Fmsm8a5Ghuz` |
| Investor wallet | `EtTzE688JinGzBD2iUSis6uYCeaMc4QYyGzKvdDhajUw` |
