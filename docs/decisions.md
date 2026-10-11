# Decisions log

Every check below needs an answer, or the fallback we picked, by **Gate G1 (Hour 1.5)**. Later decisions go in the log at the bottom.

## Gate G1 checks (open: Ezekiel's data checks and the phone test)

| # | Check | Owner | Result | Fallback if no |
| --- | --- | --- | --- | --- |
| 1 | USGS legacy instantaneous and peak endpoints answer for our gauges; which `api.waterdata.usgs.gov` endpoints cover them; rate limits; history depth | Ezekiel | | New USGS API; otherwise disk cache only and no live poller |
| 2 | NWS flood-stage access path for our forecast points | Ezekiel | | Set `trigger_ft` from USGS annual-peak percentiles |
| 3 | `api.weather.gov/alerts` returns flood watches and warnings by point | Ezekiel | | Manual sales-freeze toggle in demo mode |
| 4 | Exact Harvey replay window, and which 4 gauges cross `trigger_ft` in it, read from stored data | Ezekiel | | Pick different gauges |
| 5 | Token-2022 NonTransferable + MetadataPointer + TokenMetadata (+ PermanentDelegate) on one mint via JS; name and status updates at fixed width | Jesse | **Yes on devnet** (Oct 10): all four extensions on one mint; name and status `ACTV` -> `PAID` -> `ACTV`. | Drop PermanentDelegate |
| 6 | Purchase transaction fits under 1,232 bytes with our metadata | Jesse | **Yes on devnet:** create 974 bytes, purchase 670 bytes (985 in the earlier local-validator run). | Fewer metadata fields; terms in the `uri` JSON |
| 7 | Squads v4 multisig, vault token account and time lock work on devnet with `@sqds/multisig` on `@solana/web3.js` 1.x | Jesse | **Yes on devnet:** multisig created; 100 aUSD moved vault -> bot through create, 2 approvals, 60 s time lock, execute. | Plain multisig, bot hot wallet |
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
| Oct 10 | Evidence hash recipe fixed (see evidence.md), with a test vector | Python, bot and verify page must agree byte for byte | Jesse |
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
| Oct 10 | GitHub repo renamed from Rug-Radar to Atlas | Matches the project; GitHub redirects the old URL | Jesse |
| Oct 10 | The web bundle never gets `SOLANA_RPC_URL`; it uses the public devnet RPC or `WEB_RPC_URL` | The provider URL carries the API key and the bundle is public | Jesse |
| Oct 10 | Engine (schema, API, replay streamer) and USGS loader built for Ezekiel, who reviews the economics and gauges | Zeke was the bottleneck for G2 | Both |
| Oct 10 | G2 run on a local TimescaleDB standing in for Tiger | Tiger connection not shared yet; same schema, real devnet | Jesse |
| Oct 10 | `npm run preflight` is the readiness check for the laptop, G3 and judging | One command instead of a checklist; changes nothing | Jesse |
| Oct 10 | Empty values in `.env.example` have their comment on the line above | python-dotenv reads `KEY=   # note` as the comment text (Node's dotenv doesn't); the engine also ignores comment-only values | Jesse |
| Oct 10 | Whiteoak is not a demo gauge | Its gauge went dark in Harvey and reported one value, so it never gets two consecutive readings | Both |

## Audit fixes (Oct 10, about 8 pm)

A full-repo audit found these; all fixed and re-tested.

| Area | Bug | Fix |
| --- | --- | --- |
| Web | After Reset the dashboard kept asking for the reset run, so the map stayed red | Pages show the latest run only while it is not reset (`activeRunId`) |
| Web build | A dev `web/.env.local` leaked `localhost` URLs into the hosted bundle | `npm run web:build` writes every `VITE_*` variable itself |
| Deploy | The laptop guide never started the engine or applied the schema, and copied 3 of 10 keypairs | `npm run stack` now starts the engine too; guide fixed |
| Engine | Live charts were empty: backfilled history was never materialized in `gauge_hourly` | `data/usgs.py iv` refreshes the aggregate for the loaded window |
| Engine | Start over a running run left its open storm payable; two Starts in one second gave a 500 | The old run is marked `reset`; run ids get a suffix; Start/Reset hold a lock |
| Chain + engine | Purchases after a replay ended were booked to `session`, so reconciliation went red | Money is booked to the latest run not reset, at the transaction's block time |
| Chain | `payout` was not validated and demo mode fell back to the fixed premium on any engine error: a 1e9 payout for 48 aUSD would stall every payout in the storm | Only the offered payouts (`PAYOUT_OPTIONS`, 250 and 500); fallback only when the engine is down, never on a 4xx |
| Bot | One bad storm (e.g. `f_int` 0) made every tick fail, stopping all payouts | Errors are caught per storm; shares outside (0, 1] are refused; true-up uses the policy's payout |
| Chain | A double submit could book a bond deposit twice; a confirmation timeout booked nothing | Ledger entries are idempotent per `entry_id`; unconfirmed deposits are booked by the confirmer loop |
| Chain | Reset or an expired reservation could free a mint whose purchase had landed, losing the policy and jamming the gauge | Reservations are freed only after the chain shows the purchase never landed |
| Chain | One reservation per wallet was not atomic; NAV fell back to 1.0 when the engine was down | Advisory lock per wallet; bond deposits refused (503) without a NAV |
| Web | Phone banner could show an old payout as new; a 429 showed the balance as 0; stale quotes stayed buyable | Banner seeded per owner; balance keeps its last value; Buy disabled on a quote error, and old data cleared when inputs change |
| Engine | A crashed replay stayed `running`; `f_fin` counted a gauge twice; stage-less readings counted as rejected; a non-ASCII token gave a 500 | Fixed, with tests |
