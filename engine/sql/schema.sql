-- Atlas engine schema for Tiger Data (TimescaleDB), build plan v3.1 section 6.2.
-- Idempotent: safe to run more than once. Apply, then the chain tables:
--   psql "$DATABASE_URL" -f engine/sql/schema.sql
--   (cd chain && npm run migrate)          # policy_pool, payout_intents
-- Owner: Ezekiel. Chain side writes policies, ledger, payout_intents; see docs/api.md.

CREATE EXTENSION IF NOT EXISTS timescaledb;

-- ---------- gauges and readings ----------

CREATE TABLE IF NOT EXISTS gauges (
  gauge_id      TEXT PRIMARY KEY,                 -- USGS site number
  name          TEXT NOT NULL,
  lat           DOUBLE PRECISION NOT NULL,
  lon           DOUBLE PRECISION NOT NULL,
  trigger_ft    DOUBLE PRECISION NOT NULL,
  nws_flood_ft  DOUBLE PRECISION,
  record_start  INT,                              -- first comparable water year [F11]
  record_note   TEXT,                             -- datum / channel-change decision [F11]
  feed_pubkey   TEXT,                             -- Switchboard feed (cut in v3.1; kept for the schema)
  demo_ready    BOOLEAN NOT NULL DEFAULT false    -- crosses trigger in the replay window [F22]
);

-- event_time: (possibly shifted) hydrologic time. wall_time: when the row was written.
CREATE TABLE IF NOT EXISTS gauge_readings (
  event_time    TIMESTAMPTZ NOT NULL,
  wall_time     TIMESTAMPTZ NOT NULL DEFAULT now(),
  gauge_id      TEXT NOT NULL,
  stage_ft      DOUBLE PRECISION,
  discharge_cfs DOUBLE PRECISION,
  source        TEXT NOT NULL,                    -- 'usgs' | 'replay'
  run_id        TEXT NOT NULL DEFAULT 'live',
  rejected      BOOLEAN NOT NULL DEFAULT false    -- data-quality guard
);
SELECT create_hypertable('gauge_readings', by_range('event_time'), if_not_exists => true);
CREATE UNIQUE INDEX IF NOT EXISTS gauge_readings_key ON gauge_readings (gauge_id, event_time, source, run_id);
CREATE INDEX IF NOT EXISTS gauge_readings_run ON gauge_readings (run_id, gauge_id, event_time DESC);

CREATE TABLE IF NOT EXISTS annual_peaks (
  gauge_id      TEXT NOT NULL,
  water_year    INT NOT NULL,
  peak_stage_ft DOUBLE PRECISION,
  peak_time     TIMESTAMPTZ,
  PRIMARY KEY (gauge_id, water_year)
);

-- ---------- runs, storms, events ----------

CREATE TABLE IF NOT EXISTS runs (
  run_id        TEXT PRIMARY KEY,
  source        TEXT NOT NULL,                    -- 'usgs' (live) | 'replay'
  started_wall  TIMESTAMPTZ NOT NULL,
  shift         INTERVAL,                         -- replay: started_wall - window_start
  clock         TIMESTAMPTZ,                      -- run clock (event time of the last reading) [F9]
  status        TEXT NOT NULL,                    -- running | done | reset
  opening_vault NUMERIC,                          -- from GET /chain/balances at start [V3]
  opening_float NUMERIC
);

CREATE TABLE IF NOT EXISTS storms (
  storm_id      TEXT PRIMARY KEY,
  run_id        TEXT NOT NULL,
  opened_at     TIMESTAMPTZ NOT NULL,
  closed_at     TIMESTAMPTZ,
  f_int         NUMERIC,                          -- engine sets at open (7.5)
  f_fin         NUMERIC,                          -- engine sets at close
  status        TEXT NOT NULL                     -- open | closed | trued_up (bot sets trued_up)
);
CREATE INDEX IF NOT EXISTS storms_run ON storms (run_id);

CREATE TABLE IF NOT EXISTS gauge_events (
  event_id      TEXT PRIMARY KEY,
  run_id        TEXT NOT NULL,
  storm_id      TEXT NOT NULL REFERENCES storms,
  gauge_id      TEXT NOT NULL REFERENCES gauges,
  opened_at     TIMESTAMPTZ NOT NULL,
  closed_at     TIMESTAMPTZ,
  latched_value DOUBLE PRECISION NOT NULL,        -- [F14]
  feed_pubkey   TEXT,
  feed_slot     BIGINT,
  preimage      TEXT NOT NULL,                    -- docs/evidence.md [F15][V2]
  evidence_hash TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS one_open_event ON gauge_events (run_id, gauge_id) WHERE closed_at IS NULL; -- [F8]
CREATE INDEX IF NOT EXISTS gauge_events_storm ON gauge_events (storm_id);

CREATE TABLE IF NOT EXISTS replay_alerts (      -- sales freeze in replay mode [F5]
  run_id        TEXT NOT NULL,
  gauge_id      TEXT NOT NULL,
  starts_at     TIMESTAMPTZ NOT NULL,
  ends_at       TIMESTAMPTZ NOT NULL,
  kind          TEXT NOT NULL                     -- e.g. 'flood_watch'
);
CREATE INDEX IF NOT EXISTS replay_alerts_run ON replay_alerts (run_id, gauge_id);

-- ---------- policies, simulated book, ledger ----------

CREATE TABLE IF NOT EXISTS policies (            -- written by the chain service
  policy_mint   TEXT PRIMARY KEY,
  owner         TEXT NOT NULL,
  gauge_id      TEXT REFERENCES gauges,
  payout_usd    NUMERIC NOT NULL,
  premium_usd   NUMERIC NOT NULL,
  starts_at     TIMESTAMPTZ NOT NULL,
  ends_at       TIMESTAMPTZ NOT NULL,
  status        CHAR(4) NOT NULL,                 -- ACTV | PAID | EXPD
  paid_amount   NUMERIC NOT NULL DEFAULT 0,
  demo          BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS policies_gauge ON policies (gauge_id, status);
CREATE INDEX IF NOT EXISTS policies_owner ON policies (owner);

CREATE TABLE IF NOT EXISTS sim_policies (        -- simulated 2,000-policy book (7.6)
  sim_id        BIGINT PRIMARY KEY,
  gauge_id      TEXT REFERENCES gauges,
  payout_usd    NUMERIC NOT NULL,
  premium_usd   NUMERIC NOT NULL
);

-- Every money movement, double entry; each entry_id sums to 0 (docs/api.md). Written by the chain side.
CREATE TABLE IF NOT EXISTS ledger (
  wall_time     TIMESTAMPTZ NOT NULL DEFAULT now(),
  run_id        TEXT NOT NULL,                    -- 'session' outside a running run [V4]
  entry_id      TEXT NOT NULL,
  account       TEXT NOT NULL,                    -- seeded|premiums|reserve|bond|float|holders|investors
  amount        NUMERIC NOT NULL,
  memo          TEXT,
  tx_sig        TEXT
);
SELECT create_hypertable('ledger', by_range('wall_time'), if_not_exists => true);
CREATE INDEX IF NOT EXISTS ledger_run ON ledger (run_id, account, wall_time DESC);

-- ---------- continuous aggregate (history charts) ----------

CREATE MATERIALIZED VIEW IF NOT EXISTS gauge_hourly
WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
SELECT time_bucket('1 hour', event_time) AS bucket, gauge_id, source, run_id,
       max(stage_ft) AS max_stage, avg(stage_ft) AS avg_stage,
       max(discharge_cfs) AS max_q, count(*) AS n
FROM gauge_readings
WHERE NOT rejected
GROUP BY bucket, gauge_id, source, run_id
WITH NO DATA;

SELECT add_continuous_aggregate_policy('gauge_hourly',
  start_offset => INTERVAL '3 days', end_offset => INTERVAL '15 minutes',
  schedule_interval => INTERVAL '15 minutes', if_not_exists => true);

-- ---------- columnstore (TimescaleDB 2.18+) [F19] ----------
-- Decades of backfill compress; future-dated replay rows stay in the rowstore.
-- On an older service use instead:
--   ALTER TABLE gauge_readings SET (timescaledb.compress, timescaledb.compress_segmentby = 'gauge_id, source, run_id',
--                                   timescaledb.compress_orderby = 'event_time DESC');
--   SELECT add_compression_policy('gauge_readings', INTERVAL '7 days', if_not_exists => true);
ALTER TABLE gauge_readings SET (
  timescaledb.enable_columnstore = true,
  timescaledb.segmentby = 'gauge_id, source, run_id',
  timescaledb.orderby = 'event_time DESC');
CALL add_columnstore_policy('gauge_readings', after => INTERVAL '7 days', if_not_exists => true);

-- Slide stat: SELECT * FROM hypertable_columnstore_stats('gauge_readings');
