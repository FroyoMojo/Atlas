# API contract (plan v3 section 4.2)

Agreed shapes between the engine (Ezekiel, read-only FastAPI) and the chain service and web app
(Jesse). The web app builds against mocks with these exact shapes until the engine is live.
Python never builds or signs a Solana transaction; only the chain service and the bot hold keys.

All engine reads except `/stress` take `run_id` (default: the latest run, unless it was reset, then live data; the dashboard sends no `run_id` after a reset). Times are ISO 8601 UTC. Money is aUSD
as decimal numbers. Policy status is a fixed-width code: `ACTV`, `PAID`, `EXPD`.

## Engine (FastAPI, Ezekiel, default `:8000`)

| Endpoint | Returns |
| --- | --- |
| `GET /gauges?run_id=` | `[{gauge_id, name, lat, lon, trigger_ft, latest_ft, status, demo_ready}]`; status `normal` / `near` / `triggered` |
| `GET /gauges/{id}/series?run_id=` | `{points: [{event_time, stage_ft}], trigger_ft, rejected_count}` |
| `GET /quote?gauge=&payout=&run_id=` | `{premium, p_payout, band: [p5, p95], k, waiting_days, sales_open, reason}` |
| `GET /pool?run_id=` | `{onchain: {seeded_capital, premiums_in, reserve, bond_capital, float, nav_per_unit, payouts_out, reconciled}, simulated: {policies, worst_year_loss, harvey_loss, reserve_used, bond_used, f_int, f_fin, investor_loss_pct}}` |
| `GET /storms?run_id=` | `[{storm_id, status, f_int, f_fin, events: [{event_id, gauge_id, opened_at, closed_at, value, evidence_hash, preimage}], payouts: [{policy, kind, amount, tx_sig}]}]`. `payouts` = confirmed rows of `payout_intents`. |
| `GET /stress?scenario=harvey\|worst_year` | `{aggregate_loss, reserve_used, bond_used, f_fin, investor_loss_pct}` |
| `GET /ledger?run_id=` | Ledger rows and totals by account |
| `GET /replay/status` | `{run_id, status, clock, streaming}` for the latest run (status `running`, `done` or `reset`). Added to v3: every page needs the current run and its clock. |
| `POST /replay/start` | `{run_id, opening: {vault, float}, streamer}`. Header `X-Admin-Token`. Records opening balances from `GET /chain/balances` and starts the replay. A run still running is abandoned (marked `reset`). 409 while another Start/Reset is in progress. |
| `POST /replay/reset` | `{run_id, chain, chain_error, reconciled, reconcile_detail}`. Header `X-Admin-Token`. Stops the run, marks it `reset`, calls `POST /chain/reset`, then reconciles. |

Implemented in [`engine/`](../engine/README.md). Additions to the shapes above (extra fields only):
`latest_ft` is `null` before a gauge's first reading; `/quote` also returns `years`,
`exceedances`, `lambda` (the rate used: the higher of `lambda_peak` and `lambda_iv`) and `term_days`;
`p_payout` is the chance of a payout within the term (90 days), and `k` is `k_i` in aUSD (annual); `/pool` `onchain` also returns `reconcile_detail`, `vault`
and `bond_units`; `/storms` also returns `opened_at`/`closed_at`, and each payout `owner` and
`gauge_id`; `/stress` also returns `water_year`, `capital` and `reserve`; `GET /health`.

## Chain service (TypeScript, Jesse, default `:8787`)

| Endpoint | Purpose |
| --- | --- |
| `GET /api/actions/buy?gauge=&payout=` | Solana Action metadata with the live quote. `payout` must be one of `PAYOUT_OPTIONS` (default 250, 500) |
| `POST /api/actions/buy?gauge=&payout=&flow=a\|b` | Body `{account}`. Flow A: transaction already signed by the server. Flow B: unsigned; the wallet signs, then `POST /api/purchase/submit`. 5/min/IP. Demo allowlist; one reservation per wallet. |
| `POST /api/purchase/submit` | Flow B. Body `{transaction}` (wallet-signed, base64). Co-signs only if the message hash matches what the server built; sends; returns `{signature}`. |
| `POST /api/bond/deposit` | Body `{account, amount}`. Returns an unsigned transaction; the wallet signs, then `POST /api/bond/submit`. |
| `POST /api/bond/submit` | Body `{transaction}`. Checks, co-signs, sends, writes the ledger entry. |
| `GET /policies?owner=` | `[{policy_mint, gauge_id, gauge_name, payout, status, paid_amount, last_payout: {amount, kind, tx_sig, at}}]` |
| `GET /policies/:mint/onchain` | On-chain name, metadata fields, supply, holder |
| `GET /chain/balances` | `{vault, float, bond_units, ausd_supply, at}` for reconciliation |
| `POST /chain/reset` | Localhost only, header `X-Admin-Token`, body `{run_id}`. Mints aUSD to refill vault and float to the snapshot, sets demo policies to `ACTV` (name and status), releases reservations whose purchase never landed, writes `seeded` ledger rows. Returns `{ok, run_id, before, after, policies_reset, reservations_released}`. |
| `GET /terms/:policyId.json`, `/actions.json`, `/icon.svg`, `/health` | Terms JSON for metadata `uri`, Actions rules, icon, health |

## Tables: who writes what

| Table | Engine (Ezekiel) | Chain side (Jesse) |
| --- | --- | --- |
| `gauges`, `gauge_readings`, `runs`, `replay_alerts`, `sim_policies` | writes | reads `gauges` |
| `storms` | writes; sets `f_int` at open, `f_fin` and `closed` at close | sets `trued_up` once every true-up confirms |
| `gauge_events` | writes, including `preimage` and `evidence_hash` | reads; re-hashes before paying |
| `policies` | reads | writes on purchase, payout and reset |
| `ledger` | reads; computes reserve/bond split, NAV, reconciliation | writes every money movement (below) |
| `payout_intents`, `policy_pool` | reads `payout_intents` for `/storms` | owns (`chain/sql/001_chain_tables.sql`) |

## Ledger entries the chain side writes

Each entry's rows sum to zero, and each `entry_id` is written once (retries write nothing).
`run_id` is the latest run that has not been reset, taken at the transaction's block time
(running, or done after its replay ended), or `session` after a Reset and before the next Start;
the next run's opening balances include those.

| Movement | Rows |
| --- | --- |
| Policy purchase | `holders −π`, `premiums +π` |
| Bond deposit | `investors −D`, `bond +D` |
| Payout (interim or true-up) | `float −amount`, `holders +amount` |
| Reset refill of the vault | `seeded −x`, `reserve +x` |
| Reset refill of the float | `seeded −y`, `float +y` |
| Vault to float by proposal (`npm run fund:bot`) | `reserve −z`, `float +z` |

## Reconciliation (audit fix)

Reset only tops balances up to the snapshot, so premiums from earlier runs stay in the vault and
absolute totals drift. Reconcile per run instead: at `POST /replay/start` record
`GET /chain/balances` as opening balances; then for vault and float,
`opening + sum(ledger rows for this run) = GET /chain/balances now`.

## Evidence

See [evidence.md](evidence.md): canonical preimage, Python and TypeScript code, test vector.
