-- docs/numbers.sql: reproduces every number on the slides from the data in Tiger.
-- Run:  python data/run_numbers.py        (or: psql "$DATABASE_URL" -f docs/numbers.sql)
-- Read-only except for TEMP views. Constants below must match the engine's settings.
--
-- Not reproducible in SQL: the 5th to 95th percentile premium bands (seeded 2,000-draw bootstrap in
-- engine/app/pricing.py, `bootstrap_band_higher_of`); read them from GET /quote.

CREATE TEMP VIEW v_params AS
SELECT 0.35::numeric AS theta,            -- risk load            PRICING_THETA
       0.06::numeric AS c,                -- coupon rate on k     PRICING_C
       0.10::numeric AS e,                -- expense ratio        PRICING_E
       (90.0 / 365)::numeric AS term_y,   -- policy term, years   TERM_YEARS = TERM_DAYS / 365
       2017 AS harvey_wy;

-- Per gauge in the simulated book: comparable-record peaks, exceedances, both rates (7.1, rule C3).
CREATE TEMP VIEW v_rates AS
WITH peaks AS (
  SELECT g.gauge_id, g.name, g.trigger_ft, g.record_start,
         count(*) AS n_years, count(*) FILTER (WHERE p.peak_stage_ft >= g.trigger_ft) AS exceed
  FROM gauges g JOIN annual_peaks p USING (gauge_id)
  WHERE p.peak_stage_ft IS NOT NULL AND (g.record_start IS NULL OR p.water_year >= g.record_start)
    AND g.gauge_id IN (SELECT DISTINCT gauge_id FROM sim_policies)
  GROUP BY 1, 2, 3, 4),
iv AS (  -- like the engine: only counts made at the gauge's current trigger
  SELECT r.gauge_id, avg(c)::numeric AS lam_iv, count(*) AS iv_years, sum(c) AS events
  FROM gauge_rates r JOIN gauges g USING (gauge_id), unnest(r.iv_counts) AS c
  WHERE r.trigger_ft IS NULL OR r.trigger_ft = g.trigger_ft
  GROUP BY 1)
SELECT p.gauge_id, p.name, p.trigger_ft, p.record_start, p.n_years, p.exceed,
       p.exceed::numeric / p.n_years AS lam_peak, iv.events, iv.iv_years, iv.lam_iv,
       greatest(p.exceed::numeric / p.n_years, coalesce(iv.lam_iv, 0)) AS lam
FROM peaks p LEFT JOIN iv USING (gauge_id);   -- no counts: peaks only, as the engine does

CREATE TEMP VIEW v_book AS
SELECT gauge_id, count(*) AS n, sum(payout_usd) AS exposure, sum(premium_usd) AS annual_premium
FROM sim_policies GROUP BY 1;

-- Scenario years: only water years in which every gauge in the book has a comparable peak (7.3).
CREATE TEMP VIEW v_scenarios AS
SELECT p.water_year,
       coalesce(sum(b.exposure) FILTER (WHERE p.peak_stage_ft >= g.trigger_ft), 0) AS loss
FROM annual_peaks p JOIN gauges g USING (gauge_id) JOIN v_book b USING (gauge_id)
WHERE p.peak_stage_ft IS NOT NULL AND (g.record_start IS NULL OR p.water_year >= g.record_start)
GROUP BY p.water_year
HAVING count(*) = (SELECT count(*) FROM v_book);

-- Capital: K = max(worst year, Harvey) - model mean; the model mean is what the premiums are loaded on.
CREATE TEMP VIEW v_capital AS
SELECT (SELECT sum(b.exposure * (1 - exp(-r.lam))) FROM v_book b JOIN v_rates r USING (gauge_id)) AS model_mean,
       (SELECT coalesce(avg(loss), 0) FROM v_scenarios) AS scenario_mean,
       (SELECT max(loss) FROM v_scenarios) AS worst_year,
       (SELECT loss FROM v_scenarios WHERE water_year = (SELECT harvey_wy FROM v_params)) AS harvey,
       (SELECT sum(exposure) FROM v_book) AS exposure,
       (SELECT sum(annual_premium) FROM v_book) AS annual_premium,
       (SELECT count(*) FROM v_scenarios) AS scenario_years;

-- name: 1_tiger_data
SELECT (SELECT count(*) FROM gauge_readings) AS readings,
       (SELECT count(*) FROM gauge_readings WHERE rejected) AS rejected,
       (SELECT count(DISTINCT gauge_id) FROM gauges) AS gauges,
       (SELECT min(event_time)::date FROM gauge_readings WHERE source = 'usgs') AS first_reading,
       (SELECT count(*) FROM annual_peaks) AS annual_peaks,
       (SELECT count(*) FROM gauge_hourly) AS hourly_aggregate_rows,
       pg_size_pretty(pg_database_size(current_database())) AS database_size;

-- name: 2_columnstore_compression
SELECT total_chunks, number_compressed_chunks,
       pg_size_pretty(before_compression_total_bytes) AS before,
       pg_size_pretty(after_compression_total_bytes) AS after,
       round(before_compression_total_bytes::numeric / after_compression_total_bytes, 1) AS ratio
FROM hypertable_columnstore_stats('gauge_readings');

-- name: 3_rates_per_gauge
SELECT gauge_id, name, trigger_ft, record_start, n_years, exceed,
       round(lam_peak, 3) AS lam_peak, events AS iv_events, iv_years, round(lam_iv, 3) AS lam_iv,
       round(lam, 3) AS lam_used
FROM v_rates ORDER BY gauge_id;

-- name: 4_simulated_book
SELECT b.gauge_id, r.name, b.n AS policies, b.exposure, round(b.annual_premium) AS annual_premium
FROM v_book b JOIN v_rates r USING (gauge_id)
UNION ALL
SELECT 'TOTAL', '', sum(n), sum(exposure), round(sum(annual_premium)) FROM v_book
ORDER BY 1;

-- name: 5_scenario_years
SELECT water_year, loss, round(100 * loss / (SELECT exposure FROM v_capital), 1) AS pct_of_exposure
FROM v_scenarios ORDER BY water_year;

-- name: 6_capital_and_stress
WITH k AS (
  SELECT model_mean, scenario_mean, worst_year, harvey, exposure, annual_premium,
         greatest(worst_year, harvey) - model_mean AS capital
  FROM v_capital),
r AS (
  SELECT k.*, k.annual_premium * (1 - (SELECT e FROM v_params)) - (SELECT c FROM v_params) * k.capital AS reserve
  FROM k)
SELECT round(model_mean) AS model_mean_loss, round(scenario_mean) AS scenario_year_mean,
       worst_year, harvey AS harvey_loss, round(capital) AS k_capital, round(reserve) AS reserve,
       round(least(harvey, reserve)) AS reserve_used,
       round(least(harvey - least(harvey, reserve), capital)) AS bond_used,
       round(100 * least(harvey - least(harvey, reserve), capital) / capital, 1) AS investor_loss_pct,
       round(least(1, (reserve + capital) / harvey), 3) AS f_fin,
       round(100 * annual_premium / exposure, 1) AS rate_on_line_pct
FROM r;

-- name: 7_demo_quotes_500_aUSD_90_days   (premium = B(1-e^-lt)(1+theta) + c k t, k = K B / sum B)
WITH cap AS (SELECT greatest(worst_year, harvey) - model_mean AS capital, exposure FROM v_capital)
SELECT r.gauge_id, r.name, r.trigger_ft, r.exceed || ' of ' || r.n_years AS exceedance_years,
       round(r.lam, 4) AS lam,
       round(greatest(1, 500 * (1 - exp(-r.lam * p.term_y)) * (1 + p.theta)      -- MIN_PREMIUM 1
             + p.c * (cap.capital * 500 / cap.exposure) * p.term_y), 2) AS premium_usd,
       round(100 * (1 - exp(-r.lam * p.term_y)), 2) AS p_payout_pct
FROM v_rates r, v_params p, cap
WHERE r.gauge_id IN (SELECT gauge_id FROM gauges WHERE demo_ready)
ORDER BY r.gauge_id;

-- name: 8_demo_gauges_and_triggers
SELECT gauge_id, name, trigger_ft, nws_flood_ft AS nws_minor_ft, record_start, demo_ready
FROM gauges ORDER BY demo_ready DESC, gauge_id;
