"""Parser and guard tests on small hand-written fixtures in the real response shapes.

These prove the pure logic only. They do not prove the live endpoints answer; that is what
preflight.py is for.
"""
import json
from datetime import datetime, timedelta, timezone

import db
import nws
import usgs

IV = json.dumps({"value": {"timeSeries": [
    {"variable": {"variableCode": [{"value": "00065"}], "noDataValue": -999999.0},
     "values": [{"value": [
         {"value": "10.50", "dateTime": "2017-08-27T00:00:00.000-05:00"},
         {"value": "10.90", "dateTime": "2017-08-27T00:15:00.000-05:00"},
         {"value": "-999999", "dateTime": "2017-08-27T00:30:00.000-05:00"},
         {"value": "", "dateTime": "2017-08-27T00:45:00.000-05:00"}]}]},
    {"variable": {"variableCode": [{"value": "00060"}], "noDataValue": -999999.0},
     "values": [{"value": [
         {"value": "1200", "dateTime": "2017-08-27T00:00:00.000-05:00"}]}]},
    {"variable": {"variableCode": [{"value": "00010"}], "noDataValue": -999999.0},
     "values": [{"value": [{"value": "30", "dateTime": "2017-08-27T00:00:00.000-05:00"}]}]},
]}})

PEAKS = """# comment
agency_cd\tsite_no\tpeak_dt\tpeak_tm\tpeak_va\tpeak_cd\tgage_ht\tgage_ht_cd\tyear_last_pk\tag_dt\tag_tm\tag_gage_ht\tag_gage_ht_cd
5s\t15s\t10d\t6s\t8s\t27s\t8s\t13s\t4s\t10d\t6s\t8s\t11s
USGS\t08075000\t1999-10-14\t12:00\t5000\t6\t30.1\t\t\t\t\t\t
USGS\t08075000\t2000-05-02\t\t4000\t6\t\t\t\t\t\t\t
USGS\t08075000\t2017-08-27\t\t20000\t6\t35.2\t\t\t2017-08-27\t\t36.00\t
USGS\t08075000\t1990-00-00\t\t\t6\t28.0\t\t\t\t\t\t
"""


def test_parse_iv_merges_series_and_drops_nodata():
    rd = usgs.parse_iv(IV)
    assert [r.stage_ft for r in rd] == [10.5, 10.9]
    assert rd[0].discharge_cfs == 1200 and rd[1].discharge_cfs is None
    assert rd[0].event_time == datetime(2017, 8, 27, 5, 0, tzinfo=timezone.utc)  # UTC


def test_parse_peaks_water_year_stage_and_drops():
    peaks, dropped = usgs.parse_peaks(PEAKS)
    by = {p.water_year: p for p in peaks}
    assert by[2000].stage_ft == 30.1 and 1999 not in by  # Oct 1999 is water year 2000
    assert dropped == 1  # May 2000 row has no stage at all
    assert by[2017].stage_ft == 36.0  # ag_gage_ht larger than gage_ht wins
    assert by[1990].stage_ft == 28.0  # unknown month/day tolerated


def test_flag_jumps_rejects_spike_and_accepts_real_step_after_gap():
    t0 = datetime(2017, 1, 1, tzinfo=timezone.utc)
    mk = lambda m, s: usgs.Reading(t0 + timedelta(minutes=m), s, None)
    out = usgs.flag_jumps([mk(0, 5.0), mk(15, 5.2), mk(30, 20.0), mk(45, 5.4),
                           mk(60, None), mk(120, 15.0)])
    assert [rej for _, rej in out] == [False, False, True, False, False]
    assert len(out) == 5  # the stage-less reading is dropped; 60 min gap lets 15.0 through


def _synthetic_peaks(step_from_i=None, noise=0.0, n=30, seed=1):
    import math, random
    rnd = random.Random(seed)
    base = datetime(1990, 1, 1, tzinfo=timezone.utc)
    out = []
    for i in range(n):
        q = 1000 * math.exp(0.15 * ((i * 7) % 20))  # wide, shuffled discharge range
        stage = 2 + 4 * math.log(q / 1000) + rnd.gauss(0, noise)
        if step_from_i is not None and i < step_from_i:
            stage -= 3.0  # older record sits 3 ft below today's relation (datum/channel change)
        out.append(usgs.Peak(1990 + i, stage, base, q))
    return out


def test_comparability_flags_old_block_and_suggests_start():
    c = usgs.comparability(_synthetic_peaks(step_from_i=15))
    assert c["usable"] and c["steps"]
    assert c["suggested_record_start"] == 2005  # years 1990-2004 are off by 3 ft


def test_comparability_clean_record_is_not_flagged_even_with_scatter():
    c = usgs.comparability(_synthetic_peaks(noise=1.2, n=60))
    assert c["usable"] and not c["steps"]
    assert c["suggested_record_start"] == 1990 and "full record" in c["verdict"]


def test_comparability_inconclusive_when_relation_is_noise():
    c = usgs.comparability(_synthetic_peaks(noise=15.0))
    assert not c["usable"] and c["verdict"] == "inconclusive"


def test_nws_flood_stage_and_alert_parsing():
    g = json.dumps({"lid": "XXXT2", "usgsId": "08075000", "name": "x",
                    "flood": {"stageUnits": "ft", "categories": {
                        "action": {"stage": 38}, "minor": {"stage": 43},
                        "moderate": {"stage": -999}, "major": {"stage": None}}}})
    s = nws.parse_flood_stages(g)
    assert s["minor"] == 43 and s["moderate"] is None and s["major"] is None
    al = json.dumps({"features": [{"properties": {"event": "Flood Watch", "severity": "Moderate"}},
                                  {"properties": {"event": "Heat Advisory"}}]})
    assert [a["event"] for a in nws.flood_alerts(al)] == ["Flood Watch"]
    idx = nws.index_gauges(json.dumps({"gauges": [
        {"lid": "A", "usgsId": "1", "latitude": 29.70, "longitude": -95.40},
        {"lid": "B", "usgsId": "", "latitude": 29.80, "longitude": -95.50}]}))
    assert [g["usgs"] for g in idx] == ["1", None]
    assert nws.match("1", None, None, idx)[1] == "usgsId"
    assert nws.match("zzz", 29.8005, -95.5005, idx)[0]["lid"] == "B"      # by location
    assert nws.match("zzz", 29.90, -95.50, idx)[0] is None                 # too far


def test_sql_splitter_keeps_statements_whole():
    stmts = db.split_sql((db.common.DATA_DIR / "policies.sql").read_text())
    assert any(s.startswith("CREATE MATERIALIZED VIEW") for s in stmts)
    assert any(s.startswith("CALL refresh_continuous_aggregate") for s in stmts)
    schema = db.split_sql((db.common.DATA_DIR / "schema.sql").read_text())
    assert sum(s.startswith("CREATE TABLE") for s in schema) == 11
