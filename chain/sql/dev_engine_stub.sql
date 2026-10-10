-- LOCAL TESTING ONLY. A plain-Postgres copy of the engine tables the chain side reads and
-- writes, from build plan v3 section 6.2 (no hypertables, no readings). Ezekiel owns the
-- real schema. Never run this against the shared Tiger database.

CREATE TABLE IF NOT EXISTS gauges (
  gauge_id TEXT PRIMARY KEY, name TEXT, lat DOUBLE PRECISION, lon DOUBLE PRECISION,
  trigger_ft DOUBLE PRECISION, nws_flood_ft DOUBLE PRECISION,
  record_start INT, record_note TEXT,
  feed_pubkey TEXT, demo_ready BOOLEAN DEFAULT false
);

CREATE TABLE IF NOT EXISTS runs (
  run_id TEXT PRIMARY KEY, source TEXT NOT NULL,
  started_wall TIMESTAMPTZ NOT NULL, shift INTERVAL,
  clock TIMESTAMPTZ,
  status TEXT NOT NULL                 -- running | done | reset
);

CREATE TABLE IF NOT EXISTS storms (
  storm_id TEXT PRIMARY KEY, run_id TEXT NOT NULL,
  opened_at TIMESTAMPTZ NOT NULL, closed_at TIMESTAMPTZ,
  f_int NUMERIC, f_fin NUMERIC, status TEXT NOT NULL   -- open | closed | trued_up
);

CREATE TABLE IF NOT EXISTS gauge_events (
  event_id TEXT PRIMARY KEY, run_id TEXT NOT NULL, storm_id TEXT NOT NULL,
  gauge_id TEXT NOT NULL, opened_at TIMESTAMPTZ NOT NULL, closed_at TIMESTAMPTZ,
  latched_value DOUBLE PRECISION NOT NULL,
  feed_pubkey TEXT, feed_slot BIGINT,
  preimage TEXT NOT NULL, evidence_hash TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS one_open_event ON gauge_events (run_id, gauge_id) WHERE closed_at IS NULL;

CREATE TABLE IF NOT EXISTS policies (
  policy_mint TEXT PRIMARY KEY, owner TEXT NOT NULL,
  gauge_id TEXT REFERENCES gauges, payout_usd NUMERIC NOT NULL,
  premium_usd NUMERIC NOT NULL, starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL, status CHAR(4) NOT NULL,        -- ACTV | PAID | EXPD
  paid_amount NUMERIC NOT NULL DEFAULT 0, demo BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS ledger (
  wall_time TIMESTAMPTZ NOT NULL DEFAULT now(), run_id TEXT NOT NULL,
  entry_id TEXT NOT NULL, account TEXT NOT NULL,
  amount NUMERIC NOT NULL, memo TEXT, tx_sig TEXT
);

CREATE TABLE IF NOT EXISTS replay_alerts (
  run_id TEXT, gauge_id TEXT, starts_at TIMESTAMPTZ, ends_at TIMESTAMPTZ, kind TEXT
);

-- v3.1 [V3]: opening balances recorded at Start for per-run reconciliation.
ALTER TABLE runs ADD COLUMN IF NOT EXISTS opening_vault NUMERIC;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS opening_float NUMERIC;
