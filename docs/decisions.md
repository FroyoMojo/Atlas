# Decisions log

Every check below needs an answer, or the fallback we picked, by **Gate G1 (Hour 1.5)**. Later decisions go in the log at the bottom.

## Gate G1 checks (overdue; answer as soon as possible)

| # | Check | Owner | Result | Fallback if no |
| --- | --- | --- | --- | --- |
| 1 | USGS legacy instantaneous and peak endpoints answer for our gauges; which `api.waterdata.usgs.gov` endpoints cover them; rate limits; history depth | Ezekiel | PARTIAL (Oct 10). Legacy iv (live and Harvey window) and the peak file answer for all 9 shortlisted gauges; 62 to 92 peak years each, all include 2017; full 2007 to now history loaded (5.8M readings). NOT yet checked: new api.waterdata.usgs.gov coverage and rate limits. | New USGS API; otherwise disk cache only and no live poller |
| 2 | NWS flood-stage access path for our forecast points | Ezekiel | **Yes** (Oct 10). NWPS API (api.water.noaa.gov/nwps/v1) gives flood categories; matched to USGS by location, and the NWS records carry the same USGS ids. Official minor flood stage used for 7 of 9 gauges; Hunting and Halls have none (p70 fallback, not priced). | Set `trigger_ft` from USGS annual-peak percentiles |
| 3 | `api.weather.gov/alerts` returns flood watches and warnings by point | Ezekiel | **Yes** (Oct 10). api.weather.gov/alerts/active?point= answered for all 9 gauge points (0 active flood alerts at test time, so alert contents are untested). Demo mode uses replay_alerts anyway (F5). | Manual sales-freeze toggle in demo mode |
| 4 | Exact Harvey replay window, and which 4 gauges cross `trigger_ft` in it, read from stored data | Ezekiel | **Done** (Oct 10). Demo gauges: Brays 08075000, Greens 08076000, Cypress 08069000, Spring Ck 08068500 (full data, margins 4.7 to 20 ft). Replay window 2017-08-24 15:45Z to 2017-08-30 04:00Z (5.5 days), 525 to 530 readings per gauge. Buffalo, Whiteoak, Hunting, Halls rejected for reading gaps of 13 to 99 h; Sims and Hunting cross by under 0.4 ft. | Pick different gauges |
| 5 | Token-2022 NonTransferable + MetadataPointer + TokenMetadata (+ PermanentDelegate) on one mint via JS; name and status updates at fixed width | Jesse | **Yes on devnet** (Oct 10): all four extensions on one mint; name and status `ACTV` -> `PAID` -> `ACTV`. | Drop PermanentDelegate |
| 6 | Purchase transaction fits under 1,232 bytes with our metadata | Jesse | **Yes on devnet:** create 974 bytes, purchase 670 bytes. | Fewer metadata fields; terms in the `uri` JSON |
| 7 | Squads v4 multisig, vault token account and time lock work on devnet with `@sqds/multisig` on `@solana/web3.js` 1.x | Jesse | **Yes on devnet:** multisig created; 100 aUSD moved vault -> bot through create, 2 approvals, 60 s time lock, execute. | Plain multisig, bot hot wallet |
| 8 | Tiger Cloud free-tier limits; whether the Tiger Data track requires Tiger Cloud | Ezekiel | **Tiger Cloud works** (Oct 10): PostgreSQL 18.6, TimescaleDB 2.30.2, columnstore API present (F19: use it), by_range present; usage limits confirmed fine by Ezekiel. Track-requires-Cloud rule: not yet read. | Local Docker TimescaleDB |
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
| Oct 10 | Policy holder is read from the expected owner's token account, not `getTokenLargestAccounts` | Public devnet RPC rate-limits that method; it broke the status round trip | Jesse |
| Oct 10 | Use a provider devnet RPC URL (Helius or QuickNode free tier) for the demo | Public devnet returns 429s under the confirmer and bot load | Jesse |
| Oct 10 | Commits go straight to `main` | Faster than pull requests during the build | Jesse |
| Oct 10 | Chain service listens on 127.0.0.1 only | The gateway is the only public entry point | Jesse |
| Oct 10 | No Vultr: host on the demo laptop behind Cloudflare Tunnel; keep the GoDaddy domain via Cloudflare DNS; Vultr track dropped | Team decision; no server to run, one command starts the stack | Jesse |
| Oct 10 | Old plan versions moved to `docs/plan/archive/` | One current plan at the top level | Jesse |
| Oct 10 | Jump guard rejects spikes only (a jump away and straight back), not any rise over 3 ft | Plan 6.4's rule deleted real Harvey rises (Brays 27.0 to 30.4 to 34.9 ft in two steps) | Ezekiel |
| Oct 10 | `record_start` set from USGS peak-file flag `gage_ht_cd=6` (datum changed), start = year after; file `data/f11_decisions.json` | The stage-discharge screen was too noisy; USGS flags are authoritative. Sims unresolved (no flag, screen disagreed) | Ezekiel |
| Oct 10 | Demo gauges: Brays, Greens, Cypress, Spring Ck; Buffalo, Whiteoak, Hunting, Halls excluded for data gaps or marginal crossings | Gaps of 13 to 99 h make a crossing an artifact; margins under 2 ft are fragile on stage | Ezekiel |
| Oct 10 | Tiger holds the full 2007 to 2026 history (5.8M readings), compressed 1.05 GB to 162 MB (6.5x) | Columnstore, finalize run; hourly aggregate verified against raw | Ezekiel |
