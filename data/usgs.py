#!/usr/bin/env python3
"""USGS loader for Tiger (plan v3.1 section 6.1): gauges, annual peaks, instantaneous values.

Minimal and re-runnable (every write is an upsert). Raw responses are written to data/cache/
before parsing (cache rule). Ezekiel owns gauge choice, trigger levels (NWS flood stage),
the datum/channel check (record_start, record_note) and the live poller.

  pip install "psycopg[binary]" python-dotenv
  python3 data/usgs.py gauges 08075000:40.5 08074500:38 --demo 08075000,08074500
  python3 data/usgs.py peaks                       # all gauges in the table, or list site numbers
  python3 data/usgs.py iv --start 2017-08-23 --end 2017-09-04   # the Harvey replay window
"""
import argparse
import csv
import datetime as dt
import io
import json
import os
import sys
import urllib.parse
import urllib.request
from pathlib import Path

import psycopg
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "data" / "cache"
SITE_URL = "https://waterservices.usgs.gov/nwis/site/"
IV_URL = "https://waterservices.usgs.gov/nwis/iv/"
PEAK_URL = "https://nwis.waterdata.usgs.gov/nwis/peak"


def fetch(url: str, params: dict, cache_name: str) -> str:
    """GET and write the raw body to data/cache/ before anything parses it."""
    CACHE.mkdir(parents=True, exist_ok=True)
    full = f"{url}?{urllib.parse.urlencode(params)}"
    with urllib.request.urlopen(full, timeout=120) as r:
        body = r.read().decode("utf-8")
    (CACHE / cache_name).write_text(body)
    return body


def rdb_rows(text: str) -> list[dict]:
    """USGS RDB: '#' comments, a header row, a column-format row, then tab-separated data."""
    lines = [ln for ln in text.splitlines() if ln and not ln.startswith("#")]
    if len(lines) < 2:
        return []
    return list(csv.DictReader(io.StringIO("\n".join([lines[0], *lines[2:]])), delimiter="\t"))


def cmd_gauges(conn, a):
    specs = dict(s.split(":") for s in a.sites)
    demo = set(filter(None, (a.demo or "").split(",")))
    body = fetch(SITE_URL, {"format": "rdb", "sites": ",".join(specs), "siteOutput": "expanded"},
                 f"site_{'_'.join(sorted(specs))}.rdb")
    for r in rdb_rows(body):
        site = r["site_no"]
        conn.execute(
            """INSERT INTO gauges (gauge_id, name, lat, lon, trigger_ft, demo_ready) VALUES (%s, %s, %s, %s, %s, %s)
               ON CONFLICT (gauge_id) DO UPDATE SET name = EXCLUDED.name, lat = EXCLUDED.lat, lon = EXCLUDED.lon,
                 trigger_ft = EXCLUDED.trigger_ft, demo_ready = EXCLUDED.demo_ready""",
            (site, r["station_nm"].replace(", TX", ""), float(r["dec_lat_va"]), float(r["dec_long_va"]),
             float(specs[site]), site in demo))
        print(f"gauge {site}  {r['station_nm']}  trigger {specs[site]} ft{'  demo' if site in demo else ''}")


def water_year(date_str: str) -> int | None:
    y, m = (int(x) for x in date_str.split("-")[:2])   # some historic peaks have month 00
    return y + 1 if m >= 10 else y


def cmd_peaks(conn, a):
    sites = a.sites or [r[0] for r in conn.execute("SELECT gauge_id FROM gauges ORDER BY gauge_id")]
    for site in sites:
        body = fetch(PEAK_URL, {"site_no": site, "agency_cd": "USGS", "format": "rdb"}, f"peak_{site}.rdb")
        best: dict[int, tuple[float, str]] = {}
        for r in rdb_rows(body):
            if not r.get("gage_ht") or not r.get("peak_dt"):
                continue
            try:
                wy, ht = water_year(r["peak_dt"]), float(r["gage_ht"])
            except ValueError:
                continue
            if wy not in best or ht > best[wy][0]:
                best[wy] = (ht, r["peak_dt"])
        for wy, (ht, day) in best.items():
            peak_time = None if "-00" in day else dt.datetime.fromisoformat(day).replace(tzinfo=dt.timezone.utc)
            conn.execute(
                """INSERT INTO annual_peaks (gauge_id, water_year, peak_stage_ft, peak_time) VALUES (%s, %s, %s, %s)
                   ON CONFLICT (gauge_id, water_year) DO UPDATE SET peak_stage_ft = EXCLUDED.peak_stage_ft,
                     peak_time = EXCLUDED.peak_time""", (site, wy, ht, peak_time))
        years = sorted(best)
        print(f"peaks {site}: {len(best)} water years" + (f" ({years[0]} to {years[-1]})" if years else ""))


def cmd_iv(conn, a):
    sites = a.sites or [r[0] for r in conn.execute("SELECT gauge_id FROM gauges ORDER BY gauge_id")]
    for site in sites:
        body = fetch(IV_URL, {"format": "json", "sites": site, "parameterCd": "00065,00060",
                              "startDT": a.start, "endDT": a.end}, f"iv_{site}_{a.start}_{a.end}.json")
        merged: dict[dt.datetime, dict] = {}
        for ts in json.loads(body)["value"]["timeSeries"]:
            code = ts["variable"]["variableCode"][0]["value"]
            nodata = ts["variable"].get("noDataValue")
            col = "stage_ft" if code == "00065" else "discharge_cfs"
            for block in ts["values"]:
                for v in block["value"]:
                    x = float(v["value"])
                    t = dt.datetime.fromisoformat(v["dateTime"]).astimezone(dt.timezone.utc)
                    merged.setdefault(t, {})[col] = None if (nodata is not None and x == nodata) else x
        rows = [(t, site, m.get("stage_ft"), m.get("discharge_cfs")) for t, m in sorted(merged.items())]
        with conn.cursor() as cur:
            cur.executemany(
                """INSERT INTO gauge_readings (event_time, gauge_id, stage_ft, discharge_cfs, source, run_id)
                   VALUES (%s, %s, %s, %s, 'usgs', 'live')
                   ON CONFLICT (gauge_id, event_time, source, run_id) DO UPDATE
                   SET stage_ft = EXCLUDED.stage_ft, discharge_cfs = EXCLUDED.discharge_cfs""", rows)
        stages = [r[2] for r in rows if r[2] is not None]
        print(f"iv {site}: {len(rows)} readings" + (f", stage {min(stages):.2f} to {max(stages):.2f} ft" if stages else ", no stage"))


def main():
    load_dotenv(ROOT / ".env")
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    g = sub.add_parser("gauges"); g.add_argument("sites", nargs="+", help="SITE:TRIGGER_FT"); g.add_argument("--demo")
    k = sub.add_parser("peaks"); k.add_argument("sites", nargs="*")
    v = sub.add_parser("iv"); v.add_argument("sites", nargs="*"); v.add_argument("--start", required=True); v.add_argument("--end", required=True)
    a = p.parse_args()
    url = os.environ.get("DATABASE_URL")
    if not url:
        sys.exit("DATABASE_URL is not set (repo-root .env)")
    with psycopg.connect(url, autocommit=True) as conn:
        {"gauges": cmd_gauges, "peaks": cmd_peaks, "iv": cmd_iv}[a.cmd](conn, a)


if __name__ == "__main__":
    main()
