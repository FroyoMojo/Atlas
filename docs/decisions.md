# Decisions log

Every check below needs an answer, or the fallback we picked, by **Gate G1 (Hour 1.5)**. Later decisions go in the log at the bottom.

## Hour 0 to 1.5 checks

| # | Check | Owner | Result | Fallback if no |
| --- | --- | --- | --- | --- |
| 1 | USGS legacy instantaneous and peak endpoints answer for our gauges; which `api.waterdata.usgs.gov` endpoints cover them; rate limits; history depth | Ezekiel | | New USGS API; otherwise disk cache only and no live poller |
| 2 | NWS flood-stage access path for our forecast points | Ezekiel | | Set `trigger_ft` from USGS annual-peak percentiles |
| 3 | `api.weather.gov/alerts` returns flood watches and warnings by point | Ezekiel | | Manual sales-freeze toggle in demo mode |
| 4 | Exact Harvey replay window, and which 4 gauges cross `trigger_ft` in it, read from stored data | Ezekiel | | Pick different gauges |
| 5 | Token-2022 NonTransferable + MetadataPointer + TokenMetadata (+ PermanentDelegate) on one mint via JS | Person B | | Drop PermanentDelegate |
| 6 | Purchase transaction fits under 1,232 bytes with our metadata | Person B | | Fewer metadata fields; terms in the `uri` JSON |
| 7 | Squads v4 multisig, vault token account and time lock work on devnet with `@sqds/multisig` on `@solana/web3.js` 1.x | Person B | | Plain multisig, bot hot wallet |
| 8 | Tiger Cloud free-tier limits; whether the Tiger Data track requires Tiger Cloud | Ezekiel | | Local Docker TimescaleDB |
| 9 | Devpost allows one project in several tracks | Person B | | Pick Overall, Solana, Tiger Data first |
| 10 | Phantom on the demo phone works in Testnet Mode and shows Token-2022 metadata | Person B | | Show status on the dashboard's phone view |

## Decision log

| Time | Decision | Why | Who |
| --- | --- | --- | --- |
| Oct 10 | Project is Atlas (parametric flood protection), not Rug Radar | Strongest fit for Overall, Environment, Solana and Tiger Data | Both |
| Oct 10 | Own test stablecoin `aUSD` instead of devnet USDC | Circle's faucet gives about 10 USDC a day | Both |
| Oct 10 | Payout marks policy `paid` instead of burning it | Visible proof in the wallet; burn at expiry | Both |
| Oct 10 | Switchboard, spending limits and Blinks are post-G2 upgrades | Highest-risk pieces must not block the core demo | Both |
