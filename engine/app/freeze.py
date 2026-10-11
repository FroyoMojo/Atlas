"""Live sales freeze: no new protection while a flood is expected at a gauge (docs/decisions.md).

Outside a replay the freeze reads the National Weather Service's active alerts for the gauge's
location (api.weather.gov). A flood, flash flood, tropical storm, hurricane or storm surge watch
or warning there closes sales until it expires, so nobody can buy once a storm is forecast. The
river already at flood level closes sales too (checked by the caller).

If the NWS can't be reached the freeze fails open (sales stay open) and logs it: the 7-day waiting
period still stops last-minute buyers from being paid for a storm that is already on its way.
"""
import logging
import threading
import time

import httpx

log = logging.getLogger("atlas.freeze")

ALERTS_URL = "https://api.weather.gov/alerts/active"
BLOCKING = ("Flood", "Flash Flood", "Hurricane", "Tropical Storm", "Storm Surge")
TTL_S = 300

_cache: dict[tuple[float, float], tuple[float, str | None]] = {}
_lock = threading.Lock()


def blocking_alert(features: list[dict]) -> str | None:
    """The first active watch or warning that should stop sales, e.g. "Flood Watch", else None."""
    for f in features:
        event = str((f.get("properties") or {}).get("event") or "")
        if event.endswith(("Watch", "Warning")) and event.startswith(BLOCKING):
            return event
    return None


def nws_alert(lat: float, lon: float) -> str | None:
    """Blocking NWS alert at a point, cached 5 minutes. None if none, or if the NWS is unreachable."""
    key = (round(lat, 3), round(lon, 3))
    now = time.monotonic()
    with _lock:
        hit = _cache.get(key)
        if hit and now - hit[0] < TTL_S:
            return hit[1]
    try:
        r = httpx.get(ALERTS_URL, params={"point": f"{lat:.4f},{lon:.4f}"}, timeout=6,
                      headers={"User-Agent": "Atlas flood protection demo (atlasflood.us)",
                               "Accept": "application/geo+json"})
        r.raise_for_status()
        alert = blocking_alert(r.json().get("features") or [])
    except Exception as e:  # noqa: BLE001
        log.warning("NWS alerts unavailable for %s,%s: %s (sales stay open)", lat, lon, e)
        return None   # not cached: try again on the next quote
    with _lock:
        _cache[key] = (now, alert)
    return alert
