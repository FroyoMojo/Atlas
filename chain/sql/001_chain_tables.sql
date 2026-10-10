-- Tables owned by the chain side (Jesse). Safe to run more than once.
-- The engine's tables (gauges, policies, trigger_events, payouts, ...) are owned by Ezekiel;
-- see docs/plan section 6.2. For local testing without them, run dev_engine_stub.sql first.

-- Pre-created, unminted policy mints waiting to be sold (plan 8.2).
CREATE TABLE IF NOT EXISTS policy_pool (
  policy_mint    TEXT PRIMARY KEY,
  policy_id      TEXT NOT NULL UNIQUE,
  gauge_id       TEXT NOT NULL,
  terms_hash     TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'free',   -- free | reserved | sold
  reserved_by    TEXT,
  reserved_until TIMESTAMPTZ,
  premium_usd    NUMERIC,
  payout_usd     NUMERIC,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS policy_pool_gauge_status ON policy_pool (gauge_id, status);

-- Waves the payout bot has finished, so a restart never pays twice.
CREATE TABLE IF NOT EXISTS bot_waves (
  wave_id      TEXT NOT NULL,
  run_id       TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  policies     INT NOT NULL,
  pay_factor   NUMERIC NOT NULL,
  PRIMARY KEY (wave_id, run_id)
);
