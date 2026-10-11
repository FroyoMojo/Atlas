# Decisions log

Every check below needs an answer, or the fallback we picked, by **Gate G1 (Hour 1.5)**. Later decisions go in the log at the bottom.

## Gate G1 checks (overdue; answer as soon as possible)

| # | Check | Owner | Result | Fallback if no |
| --- | --- | --- | --- | --- |
| 1 | USGS legacy instantaneous and peak endpoints answer for our gauges; which `api.waterdata.usgs.gov` endpoints cover them; rate limits; history depth | Ezekiel | PARTIAL (Oct 10). Legacy iv (live and Harvey window) and the peak file answer for all 9 shortlisted gauges; 62 to 92 peak years each, all include 2017; full 2007 to now history loaded (5.8M readings). NOT yet checked: new api.waterdata.usgs.gov coverage and rate limits. | New USGS API; otherwise disk cache only and no live poller |
| 2 | NWS flood-stage access path for our forecast points | Ezekiel | **Yes** (Oct 10). NWPS API (api.water.noaa.gov/nwps/v1) gives flood categories; matched to USGS by location, and the NWS records carry the same USGS ids. Official minor flood stage used for 7 of 9 gauges; Hunting and Halls have none (p70 fallback, not priced). | Set `trigger_ft` from USGS annual-peak percentiles |
| 3 | `api.weather.gov/alerts` returns flood watches and warnings by point | Ezekiel | **Yes** (Oct 10). api.weather.gov/alerts/active?point= answered for all 9 gauge points (0 active flood alerts at test time, so alert contents are untested). Demo mode uses replay_alerts anyway (F5). | Manual sales-freeze toggle in demo mode |
| 4 | Exact Harvey replay window, and which 4 gauges cross `trigger_ft` in it, read from stored data | Ezekiel | **Done** (Oct 10, revised). Demo gauges: Brays 08075000, Buffalo Bayou at Piney Point 08073700, Cypress 08069000, Spring Ck 08068500: clean data in their own replay windows, margins 4.7 to 20 ft over the NWS minor flood stage. Replay window 2017-08-25 04:45Z to 2017-08-30 04:00Z (5.0 days), 477 to 478 readings per gauge (plan expected 480 to 580; seconds per reading is derived from the actual count). Greens dropped (see log). Whiteoak, Buffalo at Houston, W Belt, Gessner excluded for gaps; Sims and Hunting cross by under 0.4 ft. | Pick different gauges |
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
| Oct 10 | Tiger migrated to plan v3.1 by data/migrate_v31.py (runs opening balances, indexes, v3.1 chain tables); engine read endpoints verified against Tiger | The v3.1 schema file would not change existing tables and its columnstore ALTER could fail on compressed chunks | Ezekiel |
| Oct 10 | Greens Bayou not covered; Buffalo Bayou at Piney Point replaces it as a demo gauge | Greens crosses its NWS minor stage about 1.1 times a year (21 events in 19 years): a $105 premium for a $500 payout even at 90 days | Both |
| Oct 10 | Policy term is 90 days (`TERM_DAYS=90` chain, `TERM_YEARS=90/365` engine); the premium is one payment for the whole term | At a 1-year term Brays costs $156 for $500 (a 23% yearly chance); at 90 days it is $42, the scale Jesse's $48 fallback assumed | Ezekiel (Jesse to confirm the chain change) |
| Oct 10 | `/quote` prices with the higher of lambda_peak and lambda_iv (rule C3), bootstrap band on both; yearly event counts stored by `data/event_rate.py --store` in `gauge_rates` | Plan 7.1: instantaneous events can exceed the annual-peak rate (Cypress 0.17 vs 0.29, Spring Ck 0.30 vs 0.42) | Ezekiel |
| Oct 10 | Sims `record_start` moved to 2008 | 20 of 71 peaks exceeded its trigger but only 1 since 2008; peak file and instantaneous maxima agree exactly from 2008 | Ezekiel |
| Oct 10 | Known limit: the premium uses an annual event rate for a 90-day term, so it ignores seasonality | Gulf Coast floods cluster in spring and the hurricane season; a term bought in the quiet season is overpriced and one bought before a storm underpriced | Ezekiel |
| Oct 10 | Simulated book: 2,000 policies over 7 gauges (Brays 440, Piney Point 280, Cypress 240, Spring 200, Whiteoak 320, Buffalo at Houston 280, Sims 240), payouts 60% $500 / 30% $250 / 10% $1,000, seeded; built by `data/build_sim_book.py`. Annual basis (premium_usd is the annual premium) | Loss scenarios are whole water years; the spread over gauges is an assumption, not data. Greens excluded | Ezekiel |
| Oct 10 | Scenario years are only those where every gauge in the book has a comparable peak (`complete_years_only`); that leaves WY2015 to WY2024 (10 years), bound by Spring Creek's record | Otherwise early years drop gauges, shrink S_y and bias the mean K is measured against | Ezekiel |
| Oct 10 | Capital charge in a quote scales with the term: pi = E[L](1+theta) + c k t | The bond coupon rate is per year; adding a full year's c k to a 90-day price raised Brays from $47 to $61 | Ezekiel |
