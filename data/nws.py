"""NWS clients: flood stages (NWPS API) and active alerts (api.weather.gov).

Both are [VERIFY] items in the plan. preflight.py records what actually answers.
"""
from __future__ import annotations

import json

import common

NWPS_BASE = "https://api.water.noaa.gov/nwps/v1"
ALERTS_URL = "https://api.weather.gov/alerts/active"


def fetch_gauges_bbox(w: float, s: float, e: float, n: float, **kw) -> common.Result:
    params = {"bbox.xmin": w, "bbox.ymin": s, "bbox.xmax": e, "bbox.ymax": n,
              "srid": "EPSG_4326"}
    return common.get(f"{NWPS_BASE}/gauges", params, ext="json", **kw)


def fetch_gauge(lid: str, **kw) -> common.Result:
    return common.get(f"{NWPS_BASE}/gauges/{lid}", None, ext="json", **kw)


def fetch_alerts_point(lat: float, lon: float, **kw) -> common.Result:
    # Live data: never serve this from cache.
    kw["force"] = True
    return common.get(ALERTS_URL, {"point": f"{lat:.4f},{lon:.4f}"}, ext="json", **kw)


def index_by_usgs(text: str) -> dict[str, dict]:
    """Map USGS site number -> {lid, name} from a bbox gauge listing."""
    doc = json.loads(text)
    out = {}
    for g in doc.get("gauges", []):
        usgs = (g.get("usgsId") or "").strip()
        if usgs:
            out[usgs] = {"lid": g.get("lid"), "name": g.get("name")}
    return out


def parse_flood_stages(text: str) -> dict:
    """Flood categories for one NWPS gauge. NWS 'flood stage' is the minor category.
    Missing values come back as -999 or null."""
    g = json.loads(text)
    cats = (g.get("flood") or {}).get("categories") or {}
    out = {}
    for name in ("action", "minor", "moderate", "major"):
        v = (cats.get(name) or {}).get("stage")
        out[name] = v if isinstance(v, (int, float)) and v > -900 else None
    return {"lid": g.get("lid"), "usgs_id": g.get("usgsId"), "name": g.get("name"),
            "stage_units": ((g.get("flood") or {}).get("stageUnits")), **out}


def flood_alerts(text: str) -> list[dict]:
    """Active alerts whose event name mentions flood, as {event, onset, ends, severity}."""
    out = []
    for f in json.loads(text).get("features", []):
        p = f.get("properties", {})
        if "flood" in (p.get("event") or "").lower():
            out.append({"event": p["event"], "onset": p.get("onset"), "ends": p.get("ends"),
                        "severity": p.get("severity")})
    return out
