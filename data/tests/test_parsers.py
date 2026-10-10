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


def test_comparability_flags_a_datum_step():
    base = datetime(1990, 1, 1, tzinfo=timezone.utc)
    import math
    peaks = []
    for i in range(30):
        q = 3000 + 400 * (i % 7)
        stage = 2 + 4 * math.log(q / 1000) + (3.0 if i >= 15 else 0)  # +3 ft after year 15
        peaks.append(usgs.Peak(1990 + i, stage, base, q))
    c = usgs.comparability(peaks)
    assert c["usable"] and c["steps"]
    assert 1990 < c["suggested_record_start"] <= 2005


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
    idx = nws.index_by_usgs(json.dumps({"gauges": [{"lid": "A", "usgsId": "1"},
                                                   {"lid": "B", "usgsId": ""}]}))
    assert list(idx) == ["1"]


def test_sql_splitter_keeps_statements_whole():
    stmts = db.split_sql((db.common.DATA_DIR / "policies.sql").read_text())
    assert any(s.startswith("CREATE MATERIALIZED VIEW") for s in stmts)
    assert any(s.startswith("CALL refresh_continuous_aggregate") for s in stmts)
    schema = db.split_sql((db.common.DATA_DIR / "schema.sql").read_text())
    assert sum(s.startswith("CREATE TABLE") for s in schema) == 11
