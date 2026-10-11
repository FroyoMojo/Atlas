# engine/: FastAPI over Tiger Data (Ezekiel)

The read API the dashboard, the chain service and the bot use, plus the two admin replay
controls. Contract: [docs/api.md](../docs/api.md). Python never builds or signs a Solana
transaction; reset goes through the chain service's `POST /chain/reset`.

**Status:** schema, every endpoint and the replay streamer (events, storms, `f_int`/`f_fin`,
sales freeze) are built and tested, including a full replay of real Harvey data loaded with
[`data/usgs.py`](../data/README.md). Still Ezekiel's: final gauge list and trigger levels (NWS
flood stage), the datum check (`record_start`), the live poller, the instantaneous-data rate and
the real simulated book.

## Run

```bash
cd engine
pip install -r requirements.txt
(cd ../chain && npm run migrate)                  # this schema + the chain tables; safe to re-run
# or: psql "$DATABASE_URL" -f sql/schema.sql && (cd ../chain && npm run migrate -- --chain)
uvicorn app.main:app --port 8000                  # reads the repo-root .env
```

The gateway (`npm run stack` in `chain/`) serves it at `/engine/*` on the public URL. For the web
app against it in dev: `VITE_USE_MOCKS=false VITE_ENGINE_URL=http://localhost:8000 npm run dev`.

## Tests

```bash
python -m pytest -q                               # pricing unit tests
ENGINE_TEST_ADMIN_URL="postgresql://postgres@/postgres?host=/tmp&port=5433" python -m pytest -q   # + API and replay tests
```

The API tests create and drop a throwaway `atlas_engine_test` database on a **local**
TimescaleDB. Never point `ENGINE_TEST_ADMIN_URL` at the Tiger service.

## Files

| File | What it does |
| --- | --- |
| `sql/schema.sql` | Plan v3.1 section 6.2 schema: hypertables, `gauge_hourly` continuous aggregate, columnstore policy |
| `app/main.py` | Endpoints |
| `app/pricing.py` | Plan section 7 formulas as pure functions (rate, premium, bootstrap band, year scenarios, capital `K`, `k_i`, waterfall, pay factor) |
| `app/replay.py` | Replay streamer: time shift, data-quality guard, event open/close, storms with `f_int`/`f_fin`, flood-watch sales freeze |
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
| `POST /replay/start` | New `run-YYYYMMDD-HHMMSS` (suffix `-2`, `-3` within the same second), opening balances from the chain; a run still running is abandoned (marked `reset`, so the bot stops paying it); starts the built-in streamer (or `REPLAY_CMD` with `RUN_ID` set). Start and Reset hold a lock: a second one at the same time gets 409 |
| `POST /replay/reset` | Stops the streamer, marks the run `reset`, calls `POST /chain/reset`, reconciles. After a reset the default view is live data |

Default reads skip a run that was reset, so Reset returns the map to normal (the dashboard sends
no `run_id` once the latest run is reset). A replay that crashes closes its open events and storm
(`f_fin = f_int`) and marks the run `done`, so nothing is left "running".

## Replay streamer (`app/replay.py`)

Replays the stored USGS readings (`source 'usgs'`, `run_id 'live'`) of the Harvey window into
the run as `source 'replay'`, in `REPLAY_SECONDS` (default 90) of wall time.

| Rule | How |
| --- | --- |
| Window | 48 h before the first `demo_ready` crossing to 24 h after the last demo peak, searched in `REPLAY_SEARCH_START`..`END` (default Aug 23 to Sep 5, 2017); or fixed with `REPLAY_WINDOW_START`/`END` |
| Shift | `event_time = original + (started_wall - window_start)`, whole seconds; `runs.clock` = last reading written |
| Guard | Rejects a reading that moved more than `REPLAY_MAX_JUMP_FT` (5) per 15 min since the last accepted one; the allowance grows with the gap, because gauges went dark mid-flood in Harvey |
| Event open | Two consecutive accepted readings at or above `trigger_ft`; latched value and preimage per docs/evidence.md |
| Event close | 72 h of event time below trigger, or the end of the replay |
| Storm | First event opens it with `f_int = min(1, A / at-risk exposure)`; A = `runs.opening_vault`; at-risk = gauges under a flood watch. Closes when all its events close, or at the end, with `f_fin = max(f_int, min(1, A / triggered exposure))`. `FORCE_F_INT=0.6` for the true-up rehearsal |
| Sales freeze | A `flood_watch` row in `replay_alerts` per crossing gauge, from 24 h before its first crossing |

Test without the API: `python -m app.replay --run RUN_ID --seconds 10` (the `runs` row must exist).

**Found in the Harvey data** (placeholder triggers, for Ezekiel to confirm):
- Brays (08075000), Buffalo at W Belt (08073600), Greens (08076000) and Sims (08075500)
  trigger cleanly; Buffalo at Houston (08074000) triggers late, on Aug 28.
- Whiteoak (08074500) went dark mid-flood and reported a single peak value, so it never gets
  two consecutive readings. Don't make it a demo gauge.
- Brays's older annual peaks are higher than its Harvey peak, a sign of a datum or channel change: set
  `record_start` before pricing (F11).

**History charts** read the `gauge_hourly` continuous aggregate. Its policy only refreshes the
last 3 days, so `data/usgs.py iv` refreshes it once for the window it loads; anything backfilled
another way needs `CALL refresh_continuous_aggregate('gauge_hourly', '<start>', '<end>')`.

## Reference economics: Ezekiel to own

The pricing constants are env settings with defaults: `PRICING_THETA=0.35`, `PRICING_C=0.06`,
`PRICING_E=0.10`, `TERM_YEARS=1`, `MIN_PREMIUM=1`, `BOOTSTRAP_N=2000`, `HARVEY_WATER_YEAR=2017`,
`SEED_RESERVE=300`. They are a working baseline written from the plan's formulas, so swap any
of them, or any function in `pricing.py`, without touching the endpoints.

**Known simplifications** (not bugs; say so if asked):
- On-chain NAV is `(bond capital - losses absorbed) / bond capital`. The plan's NAV also adds
  coupons accrued (`c k` per premium); on devnet premiums stay whole in the reserve.
- Nothing moves a policy to `EXPD` at the end of its term: demo policies run 365 days, longer
  than the hackathon. Expiry (status `EXPD`, PermanentDelegate burn) is the production step.
