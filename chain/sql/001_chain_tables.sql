-- Tables owned by the chain side (Jesse). Safe to run more than once.
-- The engine's tables (gauges, runs, storms, gauge_events, policies, ledger, replay_alerts)
-- are owned by Ezekiel; see plan v3 section 6.2. For local testing without them, run
-- dev_engine_stub.sql first (npm run migrate -- --dev-stub).

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
  -- Flow B: sha256 of the exact message the server built; submit co-signs only on a match.
  message_hash   TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS policy_pool_gauge_status ON policy_pool (gauge_id, status);

-- Payout intents (plan 8.6): written with the signature BEFORE the transaction is sent.
-- Additions to the v3 schema: last_valid_block_height (to tell "expired" from "still in
-- flight" after a restart), attempts, gauge_id/event_id (for the Memo and the phone banner).
CREATE TABLE IF NOT EXISTS payout_intents (
  intent_id               TEXT PRIMARY KEY,          -- sha256(policy_mint|storm_id|kind)
  run_id                  TEXT NOT NULL,
  storm_id                TEXT NOT NULL,
  event_id                TEXT NOT NULL,
  policy_mint             TEXT NOT NULL,
  owner                   TEXT NOT NULL,
  gauge_id                TEXT NOT NULL,
  kind                    TEXT NOT NULL,             -- interim | trueup
  amount                  NUMERIC NOT NULL,
  tx_sig                  TEXT NOT NULL,
  last_valid_block_height BIGINT NOT NULL,
  status                  TEXT NOT NULL,             -- signed | sent | confirmed | expired
  attempts                INT NOT NULL DEFAULT 1,
  created_wall            TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_wall          TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS payout_intents_status ON payout_intents (status);
CREATE INDEX IF NOT EXISTS payout_intents_storm ON payout_intents (storm_id, kind);
