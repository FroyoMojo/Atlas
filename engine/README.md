# engine/: FastAPI over Tiger Data (Ezekiel)

The read API the dashboard, the chain service and the bot use, plus the two admin replay
controls. Contract: [docs/api.md](../docs/api.md). Python never builds or signs a Solana
transaction; reset goes through the chain service's `POST /chain/reset`.

**Status:** schema and every endpoint are built and tested against TimescaleDB 2.30 with a
small fixture, and the dashboard runs on it with mocks off. Not built yet (Ezekiel): USGS
ingestion and backfill (`data/`), the replay streamer, opening and closing events and storms
(writing `f_int`/`f_fin`), the instantaneous-data rate, and the real simulated book.

## Run

```bash
cd engine
pip install -r requirements.txt
psql "$DATABASE_URL" -f sql/schema.sql            # once; idempotent, safe to re-run
(cd ../chain && npm run migrate)                  # chain tables: policy_pool, payout_intents
uvicorn app.main:app --port 8000                  # reads the repo-root .env
```

The gateway (`npm run stack` in `chain/`) serves it at `/engine/*` on the public URL. For the web
app against it in dev: `VITE_USE_MOCKS=false VITE_ENGINE_URL=http://localhost:8000 npm run dev`.

## Tests

```bash
python -m pytest -q                               # pricing unit tests
ENGINE_TEST_ADMIN_URL="postgresql://postgres@/postgres?host=/tmp&port=5433" python -m pytest -q   # + API tests
```

The API tests create and drop a throwaway `atlas_engine_test` database on a **local**
TimescaleDB. Never point `ENGINE_TEST_ADMIN_URL` at the Tiger service.

## Files

| File | What it does |
| --- | --- |
| `sql/schema.sql` | Plan v3.1 section 6.2 schema: hypertables, `gauge_hourly` continuous aggregate, columnstore policy |
| `app/main.py` | Endpoints |
| `app/pricing.py` | Plan section 7 formulas as pure functions (rate, premium, bootstrap band, year scenarios, capital `K`, `k_i`, waterfall, pay factor) |
| `app/evidence.py` | Preimage and hash; the server refuses to start if the test vector fails |
| `app/db.py`, `app/settings.py` | Connection pool; settings from the repo-root `.env` |

## How each read is computed

| Endpoint | Source |
| --- | --- |
| `/replay/status` | Latest run; `clock` is `runs.clock`, else the run's latest reading |
| `/gauges` | Latest non-rejected reading for the run (else live); `triggered` if the gauge has an event this run, `near` at 90% of trigger. `latest_ft` is `null` before the first reading |
| `/gauges/{id}/series` | Run readings; with no run, the last 7 days of hourly maxima from `gauge_hourly` |
| `/quote` | Annual peaks in the comparable record (`record_start`): `lambda = N/T`, `pi = B(1-e^{-lambda t})(1+theta) + c k`, 2,000-draw bootstrap band. `k` is `k_i` in aUSD. Sales freeze on an open event or an active `replay_alerts` row at the run clock. Extra fields: `years`, `exceedances` |
| `/pool` | On-chain: ledger plus `GET /chain/balances`. Reserve = seeded 300 + all premiums; this run's payouts hit the reserve, then the bond. Reconciled if opening + this run's ledger = chain now (vault: premiums, reserve, bond; float: float). Simulated: `sim_policies` through this run's triggered gauges |
| `/stress` | Each water year is a scenario across all gauges; `K = max(worst, Harvey) - mean`; reserve = premiums less expenses and coupons |
| `/storms` | `storms`, `gauge_events`, confirmed `payout_intents` |
| `/ledger` | Rows and totals for the run (`session` with no run) |
| `POST /replay/start` | New `run-YYYYMMDD-HHMMSS`, opening balances from the chain; starts `REPLAY_CMD` with `RUN_ID` set, if configured |
| `POST /replay/reset` | Stops the streamer, marks the run `reset`, calls `POST /chain/reset`, reconciles. After a reset the default view is live data |

Default reads skip a run that was reset, so Reset returns the map to normal.

## Reference economics: Ezekiel to own

The pricing constants are env settings with defaults: `PRICING_THETA=0.35`, `PRICING_C=0.06`,
`PRICING_E=0.10`, `TERM_YEARS=1`, `MIN_PREMIUM=1`, `BOOTSTRAP_N=2000`, `HARVEY_WATER_YEAR=2017`,
`SEED_RESERVE=300`. They are a working baseline written from the plan's formulas, so swap any
of them, or any function in `pricing.py`, without touching the endpoints.
