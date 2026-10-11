# Handoff

Read this first when you pick up the repo. Update the **Status** and **Next steps** sections whenever you stop working.

## Status (Oct 10, about 8 pm CDT, Hour 7: after G2 and a full repo audit)

- Build plan **v3.1** is current: [docs/plan/Atlas_Build_Plan_v3.1.pdf](plan/Atlas_Build_Plan_v3.1.pdf). Its fixes (V1 to V17) are listed in the plan; the decisions that resulted are in [decisions.md](decisions.md).
- **Built and tested:**
  - [`chain/`](../chain/README.md): chain service (purchase Flow A and B, bond, reset with refill, balances), storm payout bot (interim and true-up, intents, crash recovery), ledger writes.
  - [`web/`](../web/README.md): map, gauge, pool, verify and phone view with the payout banner; Start/Reset behind the admin token.
  - [`engine/`](../engine/README.md): Tiger schema (one command), every read endpoint, Start/Reset, and the replay streamer (events, storms, `f_int`/`f_fin`, sales freeze), tested on real Harvey data.
  - [`data/usgs.py`](../data/README.md): loads gauges, annual peaks and the Harvey window from USGS.
  - [`deploy/`](../deploy/README.md): laptop hosting; `npm run stack` runs engine, chain service, bot and gateway.
  - [`tools/g2_storm.py`](../tools/g2_storm.py): opens a storm directly (true-up rehearsal); tested with interim 0.6 and true-up 1.0.
- **Devnet:** set up and checked; addresses below. RPC: Helius devnet (key in `.env` only, never in the web bundle).
- **G2 passed on devnet (Oct 10, about 7 pm CDT)**, with a local TimescaleDB standing in for Tiger and real Harvey data: Reset refilled vault and float, holder1 bought a Brays policy (engine-priced), the replay crossed Brays and the bot paid 500 aUSD with the evidence Memo ([payout tx](https://explorer.solana.com/tx/3cfDne5GMs4ruDHkBP6AfqfotThG7VLM1xZJUE8yRdEd819k1SXr7NyUhA1XFYkPAymwPZVbDBSe5UGTtVfHKKwz?cluster=devnet)); the pool reconciled. Reset, then a second run: paid again, reconciled again.
- **Audit (Oct 10, 8 pm):** 8 demo-affecting bugs and about 10 smaller ones fixed (see [decisions.md](decisions.md), "Audit fixes"), all re-tested.
- **Not done:** Tiger itself (connection string from Ezekiel), Ezekiel's final gauges and NWS trigger levels, the `record_start` datum check, the live poller, the real simulated book and pricing review, public URL and domain, phone test.
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
- [ ] Jesse: set up Zeke's Windows laptop with the laptop kit (keys + pre-filled `.env`) following [deploy/WINDOWS.md](../deploy/WINDOWS.md); tunnel URL, then the domain on Cloudflare; `npm run preflight` until READY.
- [ ] Jesse: phone test, Flow A or B ([phone-test.md](phone-test.md)); record #10 and #11 in [decisions.md](decisions.md).
- [ ] Ezekiel: share the Tiger connection string and the four `demo_ready` gauge IDs (and use the shared `ADMIN_TOKEN` from Jesse).
- [ ] Jesse: on the demo laptop, `npm run migrate` and `npm run precreate -- G1,G2,G3,G4 10` with those gauge IDs.
- [x] Schema written: `cd chain && npm run migrate` applies the engine and chain tables (run it on Tiger once it exists; no psql needed).
- [ ] Ezekiel: load `gauges`, `annual_peaks`, live `gauge_readings` and `sim_policies`; review the reference economics in [engine/README.md](../engine/README.md).
- [x] Replay streamer with events, storms, `f_int`/`f_fin` and the sales freeze (`engine/app/replay.py`); tested on real Harvey data.
- [ ] Ezekiel: confirm the demo gauges and trigger levels (NWS flood stage), then load them: `python3 data/usgs.py gauges ...`, `peaks`, `iv` ([data/README.md](../data/README.md)). Whiteoak went dark in Harvey: not a demo gauge.
- [x] `GET /replay/status`; `/replay/start` records opening balances from `GET /chain/balances`; `/replay/reset` calls `POST /chain/reset` with `X-Admin-Token`.
- [ ] Jesse: run the dashboard with `VITE_USE_MOCKS=false` once Tiger has data.
- [x] G2 on devnet (local DB stand-in for Tiger), see Status.
- [ ] Both: repeat on Tiger with the final demo gauges: `npm run stack`, Reset, buy, Start.

## Accounts and addresses

Fill these in as they are created. Public addresses only; never paste private keys here.

| Item | Value |
| --- | --- |
| Hosted URL | |
| Domain | |
| Tunnel URL (trycloudflare) | |
| Tiger Cloud service | (connection string in `.env` only) |
| `aUSD` mint | `8rcNwXHnYbUG9Nm9gb3dXEJujPXsdkQAnCiL8UbnBbxo` |
| Squads multisig | `3EWJH9r4uo9AoV8LiDRthFQZ6PpWx89c9SqWFuwkaKoU` (2-of-3, 60 s time lock) |
| Squads vault | `AC2BQCvsmLeaYSwWwQw6PvU7GN7y2q6bDNjLfx2C265o` |
| Bot public key | `4XfPahYq4Yq1n89tECuMC7fzxjRBwnRkFjKqpJa9BA66` |
| Bond token mint | `CkLe9NUaKPLAdhHM3dZFDVdqWuNena2ow5zHKdDrtc8T` |
| Demo policyholder wallets | Jesse phone (Phantom): `72t74q3nTQDM6t9CqNMDhSiL9ykzxPnoQKudDs3Bu5co`; backups holder1 `GX5R6aJMni9UVmCg6EtsWKzrG5h2fVitn6U2X1YwBtDL`, holder2 `7e1DzCBHLDYxGaCQWQ1qWTVUn2MdFmqrupJfcuDxt6Mp`, holder3 `2JKWpyXV714myXxfavMmHmj5BqjZ3FGA6Fmsm8a5Ghuz` |
| Investor wallet | `EtTzE688JinGzBD2iUSis6uYCeaMc4QYyGzKvdDhajUw` |
