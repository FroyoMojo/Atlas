"""Event rate from instantaneous data (plan 7.1, rule C3): lambda_iv, next to lambda_peak.

  python data/event_rate.py            # print lambda_peak and lambda_iv per gauge
  python data/event_rate.py --store    # also write per-water-year event counts to gauge_rates

An event opens at the second of two consecutive accepted readings at or above trigger_ft and
closes after 72 h below it, so crossings less than 72 h apart are one event. Counted over the
complete water years inside the gauge's comparable record (the later of 2007-10-01 and the water
year after the datum change). The engine prices with the higher of lambda_peak and lambda_iv, and
bootstraps both from the stored yearly counts.
"""
import datetime as dt
import sys

import db

CREATE = """
CREATE TABLE IF NOT EXISTS gauge_rates (
  gauge_id    TEXT PRIMARY KEY,
  iv_years    INT[] NOT NULL,      -- complete water years counted
  iv_counts   INT[] NOT NULL,      -- events opened in each of those years
  trigger_ft  DOUBLE PRECISION,    -- trigger the counts were made at; the engine ignores stale rows
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now()
)"""
ADD_TRIGGER = "ALTER TABLE gauge_rates ADD COLUMN IF NOT EXISTS trigger_ft DOUBLE PRECISION"

EVENTS = """
WITH r AS (
  SELECT event_time, stage_ft,
         lag(stage_ft) OVER (ORDER BY event_time) AS prev
  FROM gauge_readings
  WHERE gauge_id = %s AND source = 'usgs' AND run_id = 'live' AND NOT rejected
    AND event_time >= %s),
c AS (
  SELECT event_time, event_time - lag(event_time) OVER (ORDER BY event_time) AS gap
  FROM r WHERE stage_ft >= %s AND prev >= %s)
SELECT event_time FROM c WHERE gap IS NULL OR gap > interval '72 hours' ORDER BY 1
"""


def water_year(t: dt.datetime) -> int:
    return t.year + 1 if t.month >= 10 else t.year


if __name__ == "__main__":
    store = "--store" in sys.argv
    conn = db.connect()
    if store:
        conn.execute(CREATE)
        conn.execute(ADD_TRIGGER)
    now = dt.datetime.now(dt.timezone.utc)
    last_complete = water_year(now) - 1
    print(f"{'gauge':<9} {'name':<34} {'demo':<4} {'WYs':>9} {'peak yrs':>8} {'exc':>3} {'lam_peak':>8} "
          f"{'events':>6} {'lam_iv':>7} {'used':>6}")
    for gid, name, trig, rs, demo in conn.execute(
            "SELECT gauge_id, name, trigger_ft, record_start, demo_ready FROM gauges ORDER BY gauge_id"):
        first_wy = max(rs or 2008, 2008)          # the instantaneous record starts 2007-10-01 = WY2008
        t0 = dt.datetime(first_wy - 1, 10, 1, tzinfo=dt.timezone.utc)
        starts = [r[0] for r in conn.execute(EVENTS, (gid, t0, trig, trig))]   # positional: pg8000
        years = list(range(first_wy, last_complete + 1))
        counts = [sum(1 for s in starts if water_year(s) == y) for y in years]
        peaks = [r[0] for r in conn.execute(
            "SELECT peak_stage_ft FROM annual_peaks WHERE gauge_id = %s AND peak_stage_ft IS NOT NULL "
            "AND (%s IS NULL OR water_year >= %s)", (gid, rs, rs))]
        exc = sum(p >= trig for p in peaks)
        lam_p = exc / len(peaks) if peaks else 0.0
        lam_i = sum(counts) / len(years) if years else 0.0
        print(f"{gid:<9} {name[:34]:<34} {'yes' if demo else '':<4} {years[0]}-{years[-1]} "
              f"{len(peaks):>8} {exc:>3} {lam_p:>8.3f} {sum(counts):>6} {lam_i:>7.3f} {max(lam_p, lam_i):>6.3f}")
        if store:
            conn.execute(
                "INSERT INTO gauge_rates (gauge_id, iv_years, iv_counts, trigger_ft) VALUES (%s, %s, %s, %s) "
                "ON CONFLICT (gauge_id) DO UPDATE SET iv_years = EXCLUDED.iv_years, "
                "iv_counts = EXCLUDED.iv_counts, trigger_ft = EXCLUDED.trigger_ft, computed_at = now()",
                (gid, years, counts, trig))
    if store:
        print("\nstored in gauge_rates")
