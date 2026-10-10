-- Atlas schema, from build plan v3 section 6.2. Safe to re-run (IF NOT EXISTS everywhere).
-- Applied by: python data/db.py schema
-- Continuous aggregate and columnstore live in policies.sql and run AFTER the backfill.

CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Readings: event_time is the (possibly shifted) hydrologic time;
-- wall_time is when the row was written. Replay never compares to now().
CREATE TABLE IF NOT EXISTS gauge_readings (
  event_time TIMESTAMPTZ NOT NULL,
  wall_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  gauge_id TEXT NOT NULL,
  stage_ft DOUBLE PRECISION,
  discharge_cfs DOUBLE PRECISION,
  source TEXT NOT NULL,                 -- 'usgs' | 'replay'
  run_id TEXT NOT NULL DEFAULT 'live',
  rejected BOOLEAN NOT NULL DEFAULT false
);
SELECT create_hypertable('gauge_readings', by_range('event_time'), if_not_exists => TRUE);
CREATE UNIQUE INDEX IF NOT EXISTS gauge_readings_uq
  ON gauge_readings (gauge_id, event_time, source, run_id);

CREATE TABLE IF NOT EXISTS gauges (
  gauge_id TEXT PRIMARY KEY, name TEXT, lat DOUBLE PRECISION, lon DOUBLE PRECISION,
  trigger_ft DOUBLE PRECISION, nws_flood_ft DOUBLE PRECISION,
  record_start INT, record_note TEXT,   -- F11 comparability decision
  feed_pubkey TEXT, demo_ready BOOLEAN DEFAULT false
);

CREATE TABLE IF NOT EXISTS annual_peaks (
  gauge_id TEXT, water_year INT, peak_stage_ft DOUBLE PRECISION,
  peak_time TIMESTAMPTZ, PRIMARY KEY (gauge_id, water_year)
);

CREATE TABLE IF NOT EXISTS runs (
  run_id TEXT PRIMARY KEY, source TEXT NOT NULL,
  started_wall TIMESTAMPTZ NOT NULL, shift INTERVAL,
  clock TIMESTAMPTZ,                    -- run clock (F9)
  status TEXT NOT NULL                  -- running | done | reset
);

CREATE TABLE IF NOT EXISTS storms (
  storm_id TEXT PRIMARY KEY, run_id TEXT NOT NULL,
  opened_at TIMESTAMPTZ NOT NULL, closed_at TIMESTAMPTZ,
  f_int NUMERIC, f_fin NUMERIC, status TEXT NOT NULL   -- open | closed | trued_up
);

CREATE TABLE IF NOT EXISTS gauge_events (
  event_id TEXT PRIMARY KEY, run_id TEXT NOT NULL, storm_id TEXT NOT NULL,
  gauge_id TEXT NOT NULL, opened_at TIMESTAMPTZ NOT NULL, closed_at TIMESTAMPTZ,
  latched_value DOUBLE PRECISION NOT NULL,              -- F14
  feed_pubkey TEXT, feed_slot BIGINT,
  preimage TEXT NOT NULL, evidence_hash TEXT NOT NULL   -- F15
);
CREATE UNIQUE INDEX IF NOT EXISTS one_open_event ON gauge_events (run_id, gauge_id)
  WHERE closed_at IS NULL;                              -- F8: one open event per gauge

CREATE TABLE IF NOT EXISTS policies (
  policy_mint TEXT PRIMARY KEY, owner TEXT NOT NULL,
  gauge_id TEXT REFERENCES gauges, payout_usd NUMERIC NOT NULL,
  premium_usd NUMERIC NOT NULL, starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL, status CHAR(4) NOT NULL,   -- ACTV | PAID | EXPD
  paid_amount NUMERIC NOT NULL DEFAULT 0, demo BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS sim_policies (
  sim_id BIGINT PRIMARY KEY, gauge_id TEXT REFERENCES gauges,
  payout_usd NUMERIC, premium_usd NUMERIC
);

-- F2: every money movement, double entry
CREATE TABLE IF NOT EXISTS ledger (
  wall_time TIMESTAMPTZ NOT NULL DEFAULT now(), run_id TEXT NOT NULL,
  entry_id TEXT NOT NULL, account TEXT NOT NULL,
  -- seeded | premiums | reserve | bond | float | holders | expenses | coupon
  amount NUMERIC NOT NULL,              -- signed; each entry sums to 0
  memo TEXT, tx_sig TEXT
);
SELECT create_hypertable('ledger', by_range('wall_time'), if_not_exists => TRUE);

-- F12: written before any payout is sent
CREATE TABLE IF NOT EXISTS payout_intents (
  intent_id TEXT PRIMARY KEY,           -- hash(policy_mint, storm_id, kind)
  run_id TEXT NOT NULL, storm_id TEXT NOT NULL, policy_mint TEXT NOT NULL,
  kind TEXT NOT NULL,                   -- interim | trueup
  amount NUMERIC NOT NULL, tx_sig TEXT NOT NULL,
  status TEXT NOT NULL,                 -- signed | sent | confirmed | expired
  created_wall TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS replay_alerts (   -- F5
  run_id TEXT, gauge_id TEXT, starts_at TIMESTAMPTZ, ends_at TIMESTAMPTZ, kind TEXT
);
