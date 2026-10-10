# API contract

Agreed shapes between the engine (Ezekiel) and the dashboard and chain services (Jesse). The dashboard builds against mock JSON in `/web/mocks` with these exact shapes until the real endpoints are live. Field names can change only if both of us agree, at Gate G1 at the latest.

Every read that involves the replay takes a `run_id`.

| Endpoint | Returns | Owner |
| --- | --- | --- |
| `GET /gauges` | `[{gauge_id, name, lat, lon, trigger_ft, latest_ft, status}]`, where `status` is `normal`, `near` or `triggered` | Ezekiel |
| `GET /gauges/{id}/series?run_id=` | `{trigger_ft, points: [{time, stage_ft}]}` | Ezekiel |
| `GET /quote?gauge=&payout=` | `{premium, p_payout, band: [p5, p95], waiting_days, sales_open, reason}` | Ezekiel |
| `GET /pool` | `{onchain: {reserve, bond_capital, nav_per_unit, premiums_in, payouts_out}, simulated: {policies, aggregate_loss, reserve_used, bond_used, prorata_cut}}` | Ezekiel |
| `GET /events?run_id=` | `[{time, gauge_id, run_id, wave_id, reading_ft, feed_value, feed_account, feed_slot, evidence_hash, pay_factor, payouts: [{policy_mint, owner, amount, tx_sig, memo_sig}]}]`. `run_id` optional, defaults to the latest run. `payouts` comes from the `payouts` table the bot writes. | Ezekiel |
| `GET /stress?scenario=harvey` | `{aggregate_loss, reserve_used, bond_used, prorata_cut, investor_loss_pct}` | Ezekiel |
| `GET /replay/status` | `{run_id, running, replay_time}`. Used by every page to know the current run. | Ezekiel |
| `POST /replay/start` | `{run_id}` | Ezekiel |
| `POST /replay/reset` | `{ok}`. Stops the run, deletes its replay rows and events, then calls the chain server's `POST /internal/demo/reset-policies` with header `x-internal-token: $INTERNAL_TOKEN` to set demo policies back to `active` | Ezekiel |
| `GET /replay/feed/{gauge_id}` | `{gauge_id, time, stage_ft}` at the current replay cursor. Public, for the optional Switchboard feed | Ezekiel |
| `GET /policies?owner=` | `[{policy_mint, gauge_id, payout, starts_at, ends_at, status}]` | Jesse |
| `GET /api/actions/buy?gauge=&payout=` | Solana Action metadata (title, icon, quote) | Jesse |
| `POST /api/actions/buy?gauge=&payout=` | Body `{account}`. Returns `{type, transaction, message, policy_mint}`: base64, partially signed purchase transaction | Jesse |
| `POST /api/bond/deposit` | Body `{account, amount}`. Returns `{type, transaction, nav_per_unit}` | Jesse |
| `POST /internal/demo/reset-policies` | Header `x-internal-token`. Returns `{ok, reset: [policy_mint]}` | Jesse |

Engine routes are served by FastAPI (default `:8000`). Jesse's routes are served by the chain server (`chain/`, default `:8787`).

## What the chain side reads and writes in Tiger

| Table | Chain side | Notes |
| --- | --- | --- |
| `gauges` | reads `feed_pubkey` | Owned by Ezekiel |
| `trigger_events` | reads | The bot pays one wave at a time. Every row needs `run_id`, `wave_id`, `reading_ft`; please fill `evidence_hash` (recipe below). |
| `policies` | writes on purchase, updates `status` on payout and reset | Schema from plan 6.2 |
| `payouts` | writes one row per payout | `tx_sig` = `memo_sig` (the Memo is in the payout transaction) |
| `policy_pool`, `bot_waves` | owns | `chain/sql/001_chain_tables.sql` |

## Evidence hash recipe

Must be byte-identical in Python (engine), TypeScript (bot) and the browser (verify page):

```
sha256_hex( gauge_id | value_ft | unix_seconds | run_id | wave_id | feed_account | feed_slot )
```

- `|` is a literal pipe between fields; no spaces.
- `value_ft` is the value acted on, formatted with exactly 2 decimals (`31.46`): `feed_value` if Switchboard is used, else `reading_ft`.
- `unix_seconds` is the event time as whole seconds since the epoch.
- `feed_account` and `feed_slot` are empty strings when Switchboard is not used.
- Python: `hashlib.sha256("|".join([gid, f"{v:.2f}", str(int(t.timestamp())), run_id, wave_id, acct or "", str(slot) if slot is not None else ""]).encode()).hexdigest()`
- Memo text on-chain: `atlas:v1:<hash>`.
- Test vector: `08074500|31.46|1791814500|run-7|w3||` hashes to `59c4a1d3774f1f5be91fa0dc2734422ce0df62c3a399301b01ddbb9f6a90fb1d`.

## Notes

- Times are ISO 8601 with a time zone.
- Money is in `aUSD` units as decimal numbers, for example `500.0`.
- Replay timestamps are shifted to the present, so they look like live data.
