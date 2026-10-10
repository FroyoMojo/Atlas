"""USGS clients and parsers (legacy WaterServices + peak file).

Parsers are pure functions so they can be tested against saved responses.
Endpoint behaviour is checked live by preflight.py; see docs/decisions.md.
"""
from __future__ import annotations

import json
import math
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from statistics import mean, stdev

import common

IV_URL = "https://waterservices.usgs.gov/nwis/iv/"
SITE_URL = "https://waterservices.usgs.gov/nwis/site/"
PEAK_URL = "https://nwis.waterdata.usgs.gov/nwis/peak"
STAGE, DISCHARGE = "00065", "00060"
NODATA = -999999.0


@dataclass(frozen=True)
class Reading:
    event_time: datetime  # UTC
    stage_ft: float | None
    discharge_cfs: float | None


@dataclass(frozen=True)
class Peak:
    water_year: int
    stage_ft: float
    peak_time: datetime  # UTC
    discharge_cfs: float | None


def _utc(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%MZ")


def fetch_iv(site: str, start: datetime, end: datetime, **kw) -> common.Result:
    params = {"format": "json", "sites": site, "parameterCd": f"{STAGE},{DISCHARGE}",
              "startDT": _utc(start), "endDT": _utc(end), "siteStatus": "all"}
    return common.get(IV_URL, params, ext="json", **kw)


def fetch_peaks(site: str, **kw) -> common.Result:
    params = {"site_no": site, "agency_cd": "USGS", "format": "rdb"}
    return common.get(PEAK_URL, params, ext="rdb", **kw)


def fetch_site_catalog(bbox: str, **kw) -> common.Result:
    """Active stream sites with instantaneous gage height inside bbox 'W,S,E,N'."""
    params = {"format": "rdb", "bBox": bbox, "siteType": "ST", "parameterCd": STAGE,
              "hasDataTypeCd": "iv", "siteStatus": "active", "seriesCatalogOutput": "true"}
    return common.get(SITE_URL, params, ext="rdb", **kw)


def fetch_site(site: str, **kw) -> common.Result:
    params = {"format": "rdb", "sites": site, "siteOutput": "expanded"}
    return common.get(SITE_URL, params, ext="rdb", **kw)


# ---------------------------------------------------------------- parsers

def _num(s) -> float | None:
    try:
        v = float(s)
    except (TypeError, ValueError):
        return None
    if math.isnan(v) or v <= NODATA:
        return None
    return v


def parse_iv(text: str) -> list[Reading]:
    """WaterML-JSON from /nwis/iv -> merged stage and discharge readings, UTC, sorted."""
    doc = json.loads(text)
    merged: dict[datetime, dict[str, float | None]] = {}
    for ts in doc.get("value", {}).get("timeSeries", []):
        code = ts["variable"]["variableCode"][0]["value"]
        key = "stage" if code == STAGE else "cfs" if code == DISCHARGE else None
        if key is None:
            continue
        nodata = _num(ts["variable"].get("noDataValue"))
        for block in ts.get("values", []):
            for v in block.get("value", []):
                val = _num(v.get("value"))
                if val is None or (nodata is not None and val == nodata):
                    continue
                t = datetime.fromisoformat(v["dateTime"]).astimezone(timezone.utc)
                merged.setdefault(t, {})[key] = val
    return [Reading(t, d.get("stage"), d.get("cfs")) for t, d in sorted(merged.items())]


def parse_rdb(text: str) -> list[dict[str, str]]:
    """Tab-separated USGS RDB: skip '#' comments, header row, and the width row."""
    lines = [ln for ln in text.splitlines() if ln and not ln.startswith("#")]
    if len(lines) < 2:
        return []
    header = lines[0].split("\t")
    return [dict(zip(header, ln.split("\t"))) for ln in lines[2:]]


def _peak_dt(date: str, time_: str) -> datetime | None:
    """peak_dt may carry unknown month/day as '00'; treat unknown parts as 1 and noon."""
    try:
        y, m, d = (int(x) for x in date.split("-"))
    except ValueError:
        return None
    hh, mm = 12, 0
    if time_ and ":" in time_:
        try:
            hh, mm = (int(x) for x in time_.split(":")[:2])
        except ValueError:
            pass
    # Peak file times are local standard time; UTC offset is applied by the caller's decision
    # (annual_peaks.peak_time is informational only). Treated as UTC here, +-6h does not matter.
    return datetime(y, m or 1, d or 1, min(hh, 23), mm, tzinfo=timezone.utc)


def parse_peaks(text: str) -> tuple[list[Peak], int]:
    """Annual peaks. Returns (peaks, dropped_without_stage).

    Stage is the larger of gage_ht (stage at peak flow) and ag_gage_ht (annual max stage when it
    differs), because the trigger is about the highest stage the gauge reached.
    One row per water year (the highest stage wins).
    """
    best: dict[int, Peak] = {}
    dropped = 0
    for r in parse_rdb(text):
        t = _peak_dt(r.get("peak_dt", ""), r.get("peak_tm", ""))
        if t is None:
            continue
        stages = [s for s in (_num(r.get("gage_ht")), _num(r.get("ag_gage_ht"))) if s is not None]
        if not stages:
            dropped += 1
            continue
        wy = t.year + 1 if t.month >= 10 else t.year
        p = Peak(wy, max(stages), t, _num(r.get("peak_va")))
        if wy not in best or p.stage_ft > best[wy].stage_ft:
            best[wy] = p
    return sorted(best.values(), key=lambda p: p.water_year), dropped


def parse_site_catalog(text: str) -> dict[str, dict]:
    """Collapse the series catalog to one entry per site: name, lat, lon, iv gage-height span."""
    out: dict[str, dict] = {}
    for r in parse_rdb(text):
        if r.get("parm_cd") != STAGE or r.get("data_type_cd") != "uv":
            continue
        site = r["site_no"]
        out[site] = {
            "site": site, "name": r.get("station_nm", ""),
            "lat": _num(r.get("dec_lat_va")), "lon": _num(r.get("dec_long_va")),
            "iv_begin": r.get("begin_date"), "iv_end": r.get("end_date"),
            "iv_count": int(r["count_nu"]) if (r.get("count_nu") or "").isdigit() else None,
        }
    return out


def parse_site(text: str) -> dict | None:
    rows = parse_rdb(text)
    if not rows:
        return None
    r = rows[0]
    return {"site": r.get("site_no"), "name": r.get("station_nm"),
            "lat": _num(r.get("dec_lat_va")), "lon": _num(r.get("dec_long_va")),
            "alt_ft": _num(r.get("alt_va")), "alt_datum": r.get("alt_datum_cd"),
            "drain_sqmi": _num(r.get("drain_area_va"))}


# ---------------------------------------------------- comparability (F11)

def comparability(peaks: list[Peak], recent_years: int = 15, block_years: int = 5,
                  min_shift_ft: float = 1.0, min_r2: float = 0.5) -> dict:
    """Screen for datum or channel change using the stage-discharge relation at annual peaks.

    Fit stage = a + b*ln(Q) on the most recent `recent_years` of peaks (the current channel and
    datum), then measure how far each earlier `block_years` block sits from that relation. A block
    is flagged when its mean residual exceeds max(min_shift_ft, 2 standard errors). The suggested
    record_start is the start of the earliest block such that it and every later block are
    unflagged. This is a screen, not proof: read the site's datum history on its USGS page before
    accepting it, and treat an `inconclusive` verdict as 'check by hand or price from discharge'.
    """
    pts = sorted((p.water_year, p.stage_ft, math.log(p.discharge_cfs)) for p in peaks
                 if p.discharge_cfs and p.discharge_cfs > 0)
    first = peaks[0].water_year if peaks else None
    if len(pts) < 20:
        return {"usable": False, "verdict": "inconclusive",
                "reason": f"only {len(pts)} peaks with discharge",
                "suggested_record_start": first, "steps": []}
    last = pts[-1][0]
    recent = [pt for pt in pts if pt[0] > last - recent_years]
    if len(recent) < 8:
        return {"usable": False, "verdict": "inconclusive",
                "reason": f"only {len(recent)} recent peaks with discharge",
                "suggested_record_start": first, "steps": []}
    xs = [x for _, _, x in recent]
    ys = [y for _, y, _ in recent]
    mx, my = mean(xs), mean(ys)
    sxx = sum((x - mx) ** 2 for x in xs)
    b = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / sxx if sxx else 0.0
    a = my - b * mx
    ss_res = sum((y - (a + b * x)) ** 2 for x, y in zip(xs, ys))
    ss_tot = sum((y - my) ** 2 for y in ys)
    r2 = 1 - ss_res / ss_tot if ss_tot else 0.0
    if r2 < min_r2:
        return {"usable": False, "verdict": "inconclusive",
                "reason": f"recent stage-discharge fit too weak (R2 {r2:.2f})",
                "fit": {"a": round(a, 3), "b": round(b, 3), "r2": round(r2, 3)},
                "suggested_record_start": first, "steps": []}
    blocks: dict[int, list[float]] = {}
    for wy, y, x in pts:
        blocks.setdefault((last - wy) // block_years, []).append(y - (a + b * x))
    table, flagged_idx = [], set()
    for k in sorted(blocks):
        v = blocks[k]
        m = mean(v)
        se = (stdev(v) / math.sqrt(len(v))) if len(v) >= 3 else float("inf")
        flag = k > 0 and len(v) >= 3 and abs(m) > max(min_shift_ft, 2 * se)
        if flag:
            flagged_idx.add(k)
        table.append({"from_wy": last - (k + 1) * block_years + 1, "to_wy": last - k * block_years,
                      "n": len(v), "mean_resid_ft": round(m, 2),
                      "se_ft": round(se, 2) if se != float("inf") else None, "flagged": flag})
    k = 0
    while k + 1 in blocks and (k + 1) not in flagged_idx:
        k += 1
    start = max(first, min(wy for wy, _, _ in pts if (last - wy) // block_years == k))
    steps = [{"from_wy": t["from_wy"], "to_wy": t["to_wy"], "shift_ft": t["mean_resid_ft"]}
             for t in table if t["flagged"]]
    comparable_years = last - start + 1
    verdict = ("consistent over the full record" if not flagged_idx
               else f"consistent since {start}" if comparable_years >= 20
               else f"only {comparable_years} comparable years since {start}: price from discharge")
    return {"usable": True, "verdict": verdict,
            "fit": {"a": round(a, 3), "b": round(b, 3), "r2": round(r2, 3)},
            "blocks": sorted(table, key=lambda t: t["from_wy"]), "steps": steps,
            "suggested_record_start": start}


# -------------------------------------------------------- quality guard

def flag_jumps(readings: list[Reading], max_jump_ft: float = 3.0,
               window: timedelta = timedelta(minutes=15)) -> list[tuple[Reading, bool]]:
    """Data-quality guard: flag spikes, keep real rises.

    Plan 6.4 says to reject a reading that jumps more than N ft from the previous accepted
    reading within 15 minutes. On Harvey data that rejects genuine flash-flood rises (Brays rose
    27.0 -> 30.4 -> 34.9 ft in two steps). So the rule here is a spike test: a reading is rejected
    only if it jumps more than `max_jump_ft` away from the previous accepted reading AND differs
    from the next reading by more than that in the same direction (it goes up or down and comes
    straight back). A sustained rise or fall passes. The last reading of a series cannot be judged
    and is accepted. Rejected readings never become the baseline. Readings without a stage are
    dropped.
    """
    rs = [r for r in readings if r.stage_ft is not None]
    out: list[tuple[Reading, bool]] = []
    prev: Reading | None = None
    for i, r in enumerate(rs):
        nxt = rs[i + 1] if i + 1 < len(rs) else None
        rejected = False
        if prev and nxt and r.event_time - prev.event_time <= window \
                and nxt.event_time - r.event_time <= window:
            d_prev = r.stage_ft - prev.stage_ft
            d_next = r.stage_ft - nxt.stage_ft
            rejected = (abs(d_prev) > max_jump_ft and abs(d_next) > max_jump_ft
                        and (d_prev > 0) == (d_next > 0))
        out.append((r, rejected))
        if not rejected:
            prev = r
    return out
