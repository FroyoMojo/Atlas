"""Bring the live Tiger database from the first data schema (data/schema.sql) to plan v3.1.

  python data/migrate_v31.py

Why not just run engine/sql/schema.sql: every table already exists, so its CREATE TABLE IF NOT
EXISTS statements would change nothing, and its ALTER TABLE ... SET (segmentby ...) would try to
reconfigure a hypertable that already has compressed chunks. This script applies only the
differences, and refuses to drop anything that holds data:

  1. runs gets opening_vault and opening_float (V3).
  2. Indexes the engine's queries rely on.
  3. NOT NULL on the engine tables where v3.1 requires it (only when the column has no NULLs).
  4. payout_intents is replaced by the chain side's v3.1 shape, but only if it is empty.
  5. The chain tables (policy_pool, payout_intents) from chain/sql/001_chain_tables.sql.

Idempotent: safe to re-run.
"""
import common
import db

STEPS = [
    ("runs.opening_vault / opening_float",
     "ALTER TABLE runs ADD COLUMN IF NOT EXISTS opening_vault NUMERIC, "
     "ADD COLUMN IF NOT EXISTS opening_float NUMERIC"),
    ("index gauge_readings_run",
     "CREATE INDEX IF NOT EXISTS gauge_readings_run ON gauge_readings (run_id, gauge_id, event_time DESC)"),
    ("index storms_run", "CREATE INDEX IF NOT EXISTS storms_run ON storms (run_id)"),
    ("index gauge_events_storm",
     "CREATE INDEX IF NOT EXISTS gauge_events_storm ON gauge_events (storm_id)"),
    ("index replay_alerts_run",
     "CREATE INDEX IF NOT EXISTS replay_alerts_run ON replay_alerts (run_id, gauge_id)"),
    ("index policies_gauge", "CREATE INDEX IF NOT EXISTS policies_gauge ON policies (gauge_id, status)"),
    ("index policies_owner", "CREATE INDEX IF NOT EXISTS policies_owner ON policies (owner)"),
    ("index ledger_run",
     "CREATE INDEX IF NOT EXISTS ledger_run ON ledger (run_id, account, wall_time DESC)"),
]

NOT_NULL = [("gauges", "name"), ("gauges", "lat"), ("gauges", "lon"), ("gauges", "trigger_ft"),
            ("gauges", "demo_ready"), ("storms", "opened_at"), ("replay_alerts", "run_id"),
            ("replay_alerts", "gauge_id"), ("replay_alerts", "starts_at"),
            ("replay_alerts", "ends_at"), ("replay_alerts", "kind"), ("annual_peaks", "gauge_id"),
            ("annual_peaks", "water_year"), ("sim_policies", "payout_usd"),
            ("sim_policies", "premium_usd")]


def main() -> None:
    with db.connect() as conn:
        for label, sql in STEPS:
            conn.execute(sql)
            print("ok  ", label)

        for table, col in NOT_NULL:
            nulls = conn.execute(f'SELECT count(*) FROM "{table}" WHERE "{col}" IS NULL').fetchone()[0]
            if nulls:
                print(f"skip NOT NULL {table}.{col}: {nulls} NULL rows")
                continue
            conn.execute(f'ALTER TABLE "{table}" ALTER COLUMN "{col}" SET NOT NULL')
        print("ok   NOT NULL constraints")

        cols = {r[0] for r in conn.execute(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name = 'payout_intents'").fetchall()}
        if cols and "last_valid_block_height" not in cols:
            n = conn.execute("SELECT count(*) FROM payout_intents").fetchone()[0]
            if n:
                raise SystemExit(f"payout_intents has {n} rows in the old shape: not dropping it")
            conn.execute("DROP TABLE payout_intents")
            print("ok   dropped empty old-shape payout_intents")

        failed = db.apply_sql(conn, common.ROOT / "chain" / "sql" / "001_chain_tables.sql",
                              tolerate=True)
        for f in failed:
            print("FAILED:", f)
        print("ok   chain tables" if not failed else "chain tables had failures")

        print("\nruns columns:", sorted(r[0] for r in conn.execute(
            "SELECT column_name FROM information_schema.columns WHERE table_name='runs'").fetchall()))
        print("payout_intents has last_valid_block_height:", bool(conn.execute(
            "SELECT 1 FROM information_schema.columns WHERE table_name='payout_intents' "
            "AND column_name='last_valid_block_height'").fetchone()))
        print("policy_pool exists:", bool(conn.execute(
            "SELECT to_regclass('policy_pool')").fetchone()[0]))


if __name__ == "__main__":
    main()
