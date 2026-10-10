# API contract

Agreed shapes between the engine (Ezekiel) and the dashboard and chain services (Jesse). The dashboard builds against mock JSON in `/web/mocks` with these exact shapes until the real endpoints are live. Field names can change only if both of us agree, at Gate G1 at the latest.

Every read that involves the replay takes a `run_id`.

| Endpoint | Returns | Owner |
| --- | --- | --- |
| `GET /gauges` | `[{gauge_id, name, lat, lon, trigger_ft, latest_ft, status}]`, where `status` is `normal`, `near` or `triggered` | Ezekiel |
| `GET /gauges/{id}/series?run_id=` | `{trigger_ft, points: [{time, stage_ft}]}` | Ezekiel |
| `GET /quote?gauge=&payout=` | `{premium, p_payout, band: [p5, p95], waiting_days, sales_open, reason}` | Ezekiel |
| `GET /pool` | `{onchain: {reserve, bond_capital, nav_per_unit, premiums_in, payouts_out}, simulated: {policies, aggregate_loss, reserve_used, bond_used, prorata_cut}}` | Ezekiel |
| `GET /events?run_id=` | `[{time, gauge_id, wave_id, reading_ft, evidence_hash, pay_factor, payouts: [{policy_mint, owner, amount, tx_sig, memo_sig}]}]` | Ezekiel (Jesse fills the transaction fields) |
| `GET /stress?scenario=harvey` | `{aggregate_loss, reserve_used, bond_used, prorata_cut, investor_loss_pct}` | Ezekiel |
| `POST /replay/start` | `{run_id}` | Ezekiel |
| `POST /replay/reset` | `{ok}`. Stops the run, deletes its replay rows and events, sets demo policies back to `active` | Ezekiel (policy reset by Jesse) |
| `GET /replay/feed/{gauge_id}` | `{gauge_id, time, stage_ft}` at the current replay cursor. Public, for the optional Switchboard feed | Ezekiel |
| `GET /policies?owner=` | `[{policy_mint, gauge_id, payout, starts_at, ends_at, status}]` | Jesse |
| `GET /api/actions/buy?gauge=` | Solana Action metadata (title, icon, quote) | Jesse |
| `POST /api/actions/buy?gauge=` | `{transaction}`: base64, partially signed purchase transaction | Jesse |
| `POST /api/bond/deposit` | `{transaction}`: base64, partially signed deposit transaction | Jesse |

## Notes

- Times are ISO 8601 with a time zone.
- Money is in `aUSD` units as decimal numbers, for example `500.0`.
- Replay timestamps are shifted to the present, so they look like live data.
