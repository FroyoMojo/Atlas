-- LOCAL TESTING ONLY. A plain-Postgres copy of the engine tables the chain side reads and
-- writes, taken from the build plan (section 6.2). Ezekiel owns the real schema, which also
-- turns these into hypertables. Do not run this against the shared Tiger database.

CREATE TABLE IF NOT EXISTS gauges (
  gauge_id TEXT PRIMARY KEY, name TEXT, lat DOUBLE PRECISION, lon DOUBLE PRECISION,
  trigger_ft DOUBLE PRECISION, nws_flood_ft DOUBLE PRECISION,
  feed_pubkey TEXT, demo_ready BOOLEAN DEFAULT false
);

CREATE TABLE IF NOT EXISTS policies (
  policy_mint TEXT PRIMARY KEY, owner TEXT NOT NULL,
  gauge_id TEXT REFERENCES gauges, payout_usd NUMERIC NOT NULL,
  premium_usd NUMERIC NOT NULL, starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL, status TEXT NOT NULL,
  demo BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS trigger_events (
  time TIMESTAMPTZ NOT NULL, gauge_id TEXT NOT NULL,
  source TEXT NOT NULL, run_id TEXT NOT NULL, wave_id TEXT NOT NULL,
  reading_ft DOUBLE PRECISION, feed_value DOUBLE PRECISION, feed_slot BIGINT,
  evidence_hash TEXT
);

CREATE TABLE IF NOT EXISTS payouts (
  time TIMESTAMPTZ NOT NULL, run_id TEXT NOT NULL, wave_id TEXT NOT NULL,
  policy_mint TEXT, owner TEXT, amount_usd NUMERIC, pay_factor NUMERIC,
  tx_sig TEXT, memo_sig TEXT
);
