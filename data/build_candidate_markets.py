"""Screen candidate flood markets outside Houston and store the result in Tiger (candidate_markets).

  python data/build_candidate_markets.py

For each USGS gauge: NWS moderate flood stage (via NWPS), annual peaks since the last USGS datum
flag, how often the moderate stage was reached, and a grade (engine/app/markets.py). These are
SIMULATED markets: nothing is sold there, the engine only prices them and shows the gap to launch.
Network calls go through the cache first; rerunning is cheap.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "engine"))

import db  # noqa: E402
import nws  # noqa: E402
import usgs  # noqa: E402
from app import markets  # noqa: E402

FIRST_WY, LAST_WY = 2008, 2025
CANDIDATES = {
    "05464500": "Iowa: Cedar River at Cedar Rapids",
    "01570500": "Pennsylvania: Susquehanna River at Harrisburg",
    "01463500": "New Jersey: Delaware River at Trenton",
    "02296750": "Florida: Peace River at Arcadia",
    "02486000": "Mississippi: Pearl River at Jackson",
    "06610000": "Nebraska: Missouri River at Omaha",
    "02089500": "North Carolina: Neuse River at Kinston",
    "07010000": "Missouri: Mississippi River at St. Louis",
    "06934500": "Missouri: Missouri River at Hermann",
    "03049500": "Pennsylvania: Allegheny River at Natrona",
    "14174000": "Oregon: Willamette River at Albany",
}

CREATE = """
CREATE TABLE IF NOT EXISTS candidate_markets (
  site TEXT PRIMARY KEY, name TEXT NOT NULL, region TEXT, lat DOUBLE PRECISION, lon DOUBLE PRECISION,
  trigger_ft DOUBLE PRECISION NOT NULL, stage_label TEXT, years INT NOT NULL, exceedances INT NOT NULL,
  first_wy INT, last_wy INT, grade TEXT NOT NULL, note TEXT, computed_at TIMESTAMPTZ NOT NULL DEFAULT now())"""


def stage_for(site):
    meta = usgs.parse_site(usgs.fetch_site(site).text)
    if not meta or meta["lat"] is None:
        return None, None
    d = 0.03
    r = nws.fetch_gauges_bbox(meta["lon"] - d, meta["lat"] - d, meta["lon"] + d, meta["lat"] + d)
    if not r.ok:
        return meta, None
    hit, _ = nws.match(site, meta["lat"], meta["lon"], nws.index_gauges(r.text), max_deg=0.02)
    return meta, (nws.parse_flood_stages(nws.fetch_gauge(hit["lid"]).text) if hit else None)


def record_start(peak_file_text):
    """First water year after the last 'gage datum changed' flag (gage_ht_cd contains 6)."""
    last = 0
    for row in usgs.parse_rdb(peak_file_text):
        if "6" in (row.get("gage_ht_cd") or "").replace(" ", "").split(","):
            last = max(last, int((row.get("peak_dt") or "0000")[:4] or 0))
    return max(FIRST_WY, last + 1) if last else FIRST_WY


if __name__ == "__main__":
    conn = db.connect()
    conn.execute(CREATE)
    print(f"{'site':<9} {'name':<44} {'trigger':>7} {'exc/yrs':>8} grade  why")
    for site, region in CANDIDATES.items():
        try:
            meta, st = stage_for(site)
            txt = usgs.fetch_peaks(site).text
            peaks, _ = usgs.parse_peaks(txt)
        except Exception as e:  # noqa: BLE001
            print(f"{site}: skipped ({type(e).__name__})")
            continue
        label = "moderate" if (st or {}).get("moderate") else "minor"
        trig = (st or {}).get("moderate") or (st or {}).get("minor")
        if not meta or not trig:
            print(f"{site}: no NWS flood stage, skipped")
            continue
        start = record_start(txt)
        flags = [p.stage_ft >= trig for p in peaks if start <= p.water_year <= LAST_WY]
        yrs = [p.water_year for p in peaks if start <= p.water_year <= LAST_WY]
        grade, why = markets.grade_market(len(flags), sum(flags))
        conn.execute(
            "INSERT INTO candidate_markets (site, name, region, lat, lon, trigger_ft, stage_label, years, exceedances, "
            "first_wy, last_wy, grade, note) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) "
            "ON CONFLICT (site) DO UPDATE SET name=EXCLUDED.name, region=EXCLUDED.region, lat=EXCLUDED.lat, "
            "lon=EXCLUDED.lon, trigger_ft=EXCLUDED.trigger_ft, stage_label=EXCLUDED.stage_label, "
            "years=EXCLUDED.years, exceedances=EXCLUDED.exceedances, first_wy=EXCLUDED.first_wy, "
            "last_wy=EXCLUDED.last_wy, grade=EXCLUDED.grade, note=EXCLUDED.note, computed_at=now()",
            (site, meta["name"], region, meta["lat"], meta["lon"], trig, label, len(flags), sum(flags),
             min(yrs) if yrs else None, max(yrs) if yrs else None, grade, "; ".join(why)))
        print(f"{site:<9} {meta['name'][:44]:<44} {trig:>7} {sum(flags):>3}/{len(flags):<4} {grade:<5}  {'; '.join(why)[:70]}")
