"""Shared helpers for the /data scripts: paths, .env loading, cache-first HTTP.

Cache rule (plan 6.1): every raw response is written to /data/cache/ before it is parsed.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

import requests

DATA_DIR = Path(__file__).resolve().parent
ROOT = DATA_DIR.parent
CACHE_DIR = DATA_DIR / "cache"
REPORT_DIR = DATA_DIR / "reports"
UA = "atlas-hackathon/0.1 (CodeRED Orion student project)"


def load_env(path: Path = ROOT / ".env") -> None:
    """Minimal .env loader. Real environment variables win."""
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.split("  #")[0].strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


@dataclass
class Result:
    ok: bool
    status: int | None
    text: str
    url: str
    cache_path: Path | None = None
    from_cache: bool = False
    error: str = ""


def _cache_path(url: str, params: dict | None, ext: str) -> Path:
    p = urlparse(url)
    key = json.dumps(sorted((params or {}).items()), default=str)
    h = hashlib.sha1((url + key).encode()).hexdigest()[:12]
    slug = re.sub(r"[^A-Za-z0-9]+", "_", p.netloc + p.path).strip("_")[:60]
    site = (params or {}).get("sites") or (params or {}).get("site_no") or ""
    site = re.sub(r"[^A-Za-z0-9]+", "_", str(site))[:40]
    return CACHE_DIR / f"{slug}__{site}__{h}.{ext}"


_last_call = 0.0


def get(url: str, params: dict | None = None, *, ext: str = "json", offline: bool = False,
        force: bool = False, min_interval: float = 0.4, timeout: int = 180,
        retries: int = 3) -> Result:
    """Cache-first GET. Never raises on HTTP or network errors; check Result.ok.

    Only HTTP 200 responses are cached. `force` re-fetches and overwrites the cache entry.
    """
    global _last_call
    path = _cache_path(url, params, ext)
    if path.exists() and not force:
        return Result(True, 200, path.read_text(), url, path, from_cache=True)
    if offline:
        return Result(False, None, "", url, error="offline mode and not in cache")

    err = ""
    for attempt in range(retries):
        wait = min_interval - (time.monotonic() - _last_call)
        if wait > 0:
            time.sleep(wait)
        _last_call = time.monotonic()
        try:
            r = requests.get(url, params=params, timeout=timeout, headers={"User-Agent": UA})
        except requests.RequestException as e:
            err = f"{type(e).__name__}: {e}"
            time.sleep(2 ** attempt)
            continue
        if r.status_code == 200:
            CACHE_DIR.mkdir(parents=True, exist_ok=True)
            path.write_text(r.text)
            path.with_suffix(path.suffix + ".meta").write_text(json.dumps(
                {"url": r.url, "fetched_at": datetime.now(timezone.utc).isoformat(),
                 "bytes": len(r.content)}))
            return Result(True, 200, r.text, r.url, path)
        err = f"HTTP {r.status_code}: {r.text[:200]!r}"
        if r.status_code in (400, 401, 403, 404):  # not going to change on retry
            return Result(False, r.status_code, r.text, r.url, error=err)
        time.sleep(2 ** attempt)
    return Result(False, None, "", url, error=err)


def write_report(name: str, payload: dict) -> Path:
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    path = REPORT_DIR / name
    path.write_text(json.dumps(payload, indent=2, default=str) + "\n")
    return path
