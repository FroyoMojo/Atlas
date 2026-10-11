-- Continuous aggregate and columnstore, from build plan v3 section 6.3.
-- Applied by: python data/db.py finalize   (AFTER the backfill, not before).
--
-- Why after: the aggregate policy only refreshes the last 3 days, so decades of backfilled
-- history would never reach gauge_hourly without the full manual refresh below. The columnstore
-- policy then compresses everything older than 7 days (the decades; replay rows are future-dated
-- and stay in the rowstore).

CREATE MATERIALIZED VIEW IF NOT EXISTS gauge_hourly
WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
SELECT time_bucket('1 hour', event_time) AS bucket, gauge_id, source, run_id,
       max(stage_ft) AS max_stage, avg(stage_ft) AS avg_stage,
       max(discharge_cfs) AS max_q, count(*) AS n
FROM gauge_readings WHERE NOT rejected
GROUP BY bucket, gauge_id, source, run_id
WITH NO DATA;

CALL refresh_continuous_aggregate('gauge_hourly', NULL, NULL);

SELECT add_continuous_aggregate_policy('gauge_hourly',
  start_offset => INTERVAL '3 days', end_offset => INTERVAL '15 minutes',
  schedule_interval => INTERVAL '15 minutes', if_not_exists => TRUE);

-- Current API (TimescaleDB 2.18+). db.py falls back to the old compression API if this fails.
ALTER TABLE gauge_readings SET (
  timescaledb.enable_columnstore = true,
  timescaledb.segmentby = 'gauge_id, source, run_id',
  timescaledb.orderby = 'event_time DESC');
CALL add_columnstore_policy('gauge_readings', after => INTERVAL '7 days', if_not_exists => TRUE);
