"""Gate G1 data verification: what is actually in Tiger, and is it usable for pricing?

  python data/verify.py
"""
import db

c = db.connect()
q = lambda s: c.execute(s).fetchall()

print("rows:", q("select count(*) from gauge_readings")[0][0],
      "| rejected:", q("select count(*) from gauge_readings where rejected")[0][0])
print(f"{'gauge':<9} {'from':<11} {'to':<11} {'rows':>8} {'stage%':>7} {'cfs%':>6} {'max_ft':>7} "
      f"{'peaks':>5} {'rec_start':>9}")
for g, a, b, n, sp, qp, mx in q(
        "select gauge_id, min(event_time)::date, max(event_time)::date, count(*), "
        "round(100.0*count(stage_ft)/count(*),1), round(100.0*count(discharge_cfs)/count(*),1), "
        "max(stage_ft) from gauge_readings group by 1 order by 1"):
    peaks, rs = q(f"select (select count(*) from annual_peaks where gauge_id='{g}'), "
                  f"(select record_start from gauges where gauge_id='{g}')")[0]
    print(f"{g:<9} {a!s:<11} {b!s:<11} {n:>8} {sp:>7} {qp:>6} {mx:>7} {peaks:>5} {rs:>9}")

print("gauge_hourly rows:", q("select count(*) from gauge_hourly")[0][0])
jobs = q("select proc_name, hypertable_name, schedule_interval from timescaledb_information.jobs "
         "where proc_name like 'policy_%'")
print("policies:", [(j[0], j[1], str(j[2])) for j in jobs])
print("database size:", q("select pg_size_pretty(pg_database_size(current_database()))")[0][0])
print("Brays Aug 25 to Sep 1 2017, hourly max stage:",
      q("select max(max_stage) from gauge_hourly where gauge_id='08075000' "
        "and bucket between '2017-08-25' and '2017-09-01'")[0][0],
      "(raw max:", q("select max(stage_ft) from gauge_readings where gauge_id='08075000' "
                     "and event_time between '2017-08-25' and '2017-09-01'")[0][0], ")")
# hourly aggregate must agree with raw on a compressed-chunk window
print("aggregate vs raw row-count check (Brays 2012):",
      q("select sum(n) from gauge_hourly where gauge_id='08075000' and bucket >= '2012-01-01' "
        "and bucket < '2013-01-01' and not source='replay'")[0][0],
      "vs", q("select count(*) from gauge_readings where gauge_id='08075000' and not rejected "
              "and event_time >= '2012-01-01' and event_time < '2013-01-01'")[0][0])
