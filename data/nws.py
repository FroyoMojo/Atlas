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


def _listing(text: str) -> list[dict]:
    doc = json.loads(text)
    if isinstance(doc, list):
        return doc
    for key in ("gauges", "features", "items", "data"):
        if isinstance(doc.get(key), list):
            return doc[key]
    return []


def index_gauges(text: str) -> list[dict]:
    """Every gauge in a bbox listing as {lid, usgs, name, lat, lon}, tolerant of key names."""
    out = []
    for g in _listing(text):
        out.append({"lid": g.get("lid"), "usgs": (g.get("usgsId") or "").strip() or None,
                    "name": g.get("name"),
                    "lat": g.get("latitude", g.get("lat")), "lon": g.get("longitude", g.get("lon"))})
    return out


def match(site: str, lat: float | None, lon: float | None, index: list[dict],
          max_deg: float = 0.003) -> tuple[dict | None, str]:
    """Match a USGS site to an NWPS gauge: by usgsId, else nearest within ~300 m."""
    for g in index:
        if g["usgs"] == site:
            return g, "usgsId"
    if lat is None or lon is None:
        return None, ""
    near = [(abs(g["lat"] - lat) + abs(g["lon"] - lon), g) for g in index
            if isinstance(g["lat"], (int, float)) and isinstance(g["lon"], (int, float))
            and abs(g["lat"] - lat) <= max_deg and abs(g["lon"] - lon) <= max_deg]
    return (min(near, key=lambda t: t[0])[1], "location") if near else (None, "")


def describe_listing(text: str) -> dict:
    """Shape of a listing response, for diagnosing a parser mismatch."""
    try:
        doc = json.loads(text)
    except ValueError:
        return {"not_json": text[:300]}
    items = _listing(text)
    return {"top_level": sorted(doc) if isinstance(doc, dict) else "list",
            "n_items": len(items), "first_item": json.dumps(items[0])[:600] if items else None}


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
