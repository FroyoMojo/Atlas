# Decisions log

Every check below needs an answer, or the fallback we picked, by **Gate G1 (Hour 1.5)**. Later decisions go in the log at the bottom.

## Gate G1 checks (overdue; answer as soon as possible)

| # | Check | Owner | Result | Fallback if no |
| --- | --- | --- | --- | --- |
| 1 | USGS legacy instantaneous and peak endpoints answer for our gauges; which `api.waterdata.usgs.gov` endpoints cover them; rate limits; history depth | Ezekiel | | New USGS API; otherwise disk cache only and no live poller |
| 2 | NWS flood-stage access path for our forecast points | Ezekiel | | Set `trigger_ft` from USGS annual-peak percentiles |
| 3 | `api.weather.gov/alerts` returns flood watches and warnings by point | Ezekiel | | Manual sales-freeze toggle in demo mode |
| 4 | Exact Harvey replay window, and which 4 gauges cross `trigger_ft` in it, read from stored data | Ezekiel | | Pick different gauges |
| 5 | Token-2022 NonTransferable + MetadataPointer + TokenMetadata (+ PermanentDelegate) on one mint via JS; name and status updates at fixed width | Jesse | Yes, all four on one mint, and name/status `ACTV` -> `PAID` -> `ACTV` round trip (local validator, Oct 10). Recheck on devnet with `npm run test:token2022`. | Drop PermanentDelegate |
| 6 | Purchase transaction fits under 1,232 bytes with our metadata | Jesse | Yes: create 985 bytes, purchase 670 bytes. | Fewer metadata fields; terms in the `uri` JSON |
| 7 | Squads v4 multisig, vault token account and time lock work on devnet with `@sqds/multisig` on `@solana/web3.js` 1.x | Jesse | Yes on a local validator with the devnet Squads program cloned: create, 2 approvals, time lock, execute. | Plain multisig, bot hot wallet |
| 8 | Tiger Cloud free-tier limits; whether the Tiger Data track requires Tiger Cloud | Ezekiel | | Local Docker TimescaleDB |
| 9 | Devpost allows one project in several tracks | Jesse | | Pick Overall, Solana, Tiger Data first |
| 10 | Phantom on the demo phone works in Testnet Mode and shows the policy name (`Atlas Policy ACTV` / `PAID`) | Jesse | | Phone view is the money moment anyway |
| 11 | Phantom accepts Flow A (server signs first) from the phone; set `PURCHASE_FLOW` and `VITE_PURCHASE_FLOW` | Jesse | | Flow B; drop Blink |

## Decision log

| Time | Decision | Why | Who |
| --- | --- | --- | --- |
| Oct 10 | Project is Atlas (parametric flood protection), not Rug Radar | Strongest fit for Overall, Environment, Solana and Tiger Data | Both |
| Oct 10 | Own test stablecoin `aUSD` instead of devnet USDC | Circle's faucet gives about 10 USDC a day | Both |
| Oct 10 | Payout marks policy `paid` instead of burning it | Visible proof in the wallet; burn at expiry | Both |
| Oct 10 | Switchboard, spending limits and Blinks are post-G2 upgrades | Highest-risk pieces must not block the core demo | Both |
| Oct 10 | Payout transaction does transfer + Memo + `status: paid` together | Can't pay without marking paid, or the reverse | Jesse |
| Oct 10 | Evidence hash recipe fixed (see api.md), with a test vector | Python, bot and verify page must agree byte for byte | Jesse |
| Oct 10 | Dashboard is Vite + React, not Next.js | Avoids Leaflet SSR and wallet-adapter client issues | Jesse |
| Oct 10 | Devnet faucet refused airdrops from the build machine | Fund the treasury from faucet.solana.com; local validator for testing | Jesse |
| Oct 10 | Plan v3 adopted; code renamed to v3 (storms, `gauge_events`, `ACTV`/`PAID`, `atlas:v3` evidence, `/chain/reset`, `X-Admin-Token`) | One source of truth before integration | Both |
| Oct 10 | Purchases and deposits outside a running run are booked to run `session` | v3 required a `run_id` but purchases happen before Start | Jesse |
| Oct 10 | Reconciliation is per run against opening balances from `/chain/balances` | Reset only tops up, so absolute totals drift with premiums | Jesse |
| Oct 10 | Flow B submit co-signs only if the message hash matches what the server built | Otherwise a buyer could change the premium before the server signs | Jesse |
| Oct 10 | Bond deposits always use wallet-first signing with server submit | Lets the server write the ledger entry with the signature | Jesse |
| Oct 10 | No metadata for aUSD | Classic SPL has no metadata extension; Metaplex costs an hour; the phone view is the money moment | Jesse |
| Oct 10 | `GET /replay/status` added to the engine contract | v3 omitted it; every page needs the current run and clock | Jesse |
| Oct 10 | Plan v3.1: hosting, Caddy, domain and deploys move to Jesse; timeline re-based from Hour 4.5, G2 at Hour 6.5 | Jesse's code was done; Zeke was the bottleneck | Both |
| Oct 10 | Commits go straight to `main` | Faster than pull requests during the build | Jesse |
| Oct 10 | Chain service listens on 127.0.0.1 only | Caddy is the only public entry point | Jesse |
| Oct 10 | Old plan versions moved to `docs/plan/archive/` | One current plan at the top level | Jesse |
