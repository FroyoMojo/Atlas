"""Hour 0 to 1.5 data checks (decisions.md checks 1, 2, 3, 8; F11 screen).

  python data/preflight.py discover   # list active Houston-area gauges with iv gage height
  python data/preflight.py check      # test every candidate in gauges.json, write the report
  python data/preflight.py check --offline   # re-run parsing from /data/cache only

Run from a machine that can reach USGS and NWS. Raw responses land in data/cache/ first.
The report goes to data/reports/preflight_report.json; paste the summary into decisions.md.
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timedelta, timezone

import common
import nws
import usgs

CFG = json.loads((common.DATA_DIR / "gauges.json").read_text())


def cmd_discover(args) -> None:
    r = usgs.fetch_site_catalog(CFG["bbox_w_s_e_n"], offline=args.offline, force=args.force)
    if not r.ok:
        raise SystemExit(f"site catalog failed: {r.error}")
    sites = usgs.parse_site_catalog(r.text)
    rows = sorted(sites.values(), key=lambda s: (s["iv_begin"] or "9999"))
    print(f"{len(rows)} active stream sites with instantaneous gage height in the bbox\n")
    print(f"{'site':<10} {'iv from':<11} {'iv to':<11} {'count':>9}  name")
    for s in rows:
        print(f"{s['site']:<10} {(s['iv_begin'] or '')[:10]:<11} {(s['iv_end'] or '')[:10]:<11} "
              f"{s['iv_count'] or 0:>9}  {s['name']}")
    print("\nPick 6 to 10 on major bayous with iv_from <= 2007 (Harvey is 2017) and a long peak "
          "record, then edit candidates in data/gauges.json.")


def check_gauge(site: str, args) -> dict:
    out: dict = {"site": site, "problems": []}

    def problem(msg):
        out["problems"].append(msg)

    kw = {"offline": args.offline}

    # Check 1a: legacy iv answers right now (live, so always forced unless offline)
    now = datetime.now(timezone.utc)
    r = usgs.fetch_iv(site, now - timedelta(hours=3), now, force=not args.offline, **kw)
    if r.ok:
        rd = usgs.parse_iv(r.text)
        out["iv_recent"] = {"readings": len(rd), "latest": rd[-1].event_time.isoformat()
                            if rd else None,
                            "has_stage": any(x.stage_ft is not None for x in rd)}
        if not rd:
            problem("legacy iv returned no readings in the last 3 hours")
    else:
        out["iv_recent"] = None
        problem(f"legacy iv failed: {r.error}")

    # Check 1b: Harvey-window iv depth
    hw = CFG["harvey_fetch_window"]
    r = usgs.fetch_iv(site, datetime.fromisoformat(hw["start"].replace("Z", "+00:00")),
                      datetime.fromisoformat(hw["end"].replace("Z", "+00:00")), **kw)
    if r.ok:
        rd = [x for x in usgs.parse_iv(r.text) if x.stage_ft is not None]
        out["iv_harvey"] = {"readings": len(rd),
                            "max_stage_ft": max((x.stage_ft for x in rd), default=None)}
        if len(rd) < 1000:
            problem(f"only {len(rd)} stage readings in the Harvey fetch window")
    else:
        out["iv_harvey"] = None
        problem(f"Harvey iv failed: {r.error}")

    # Check 1c: peaks and the record
    r = usgs.fetch_peaks(site, **kw)
    peaks: list[usgs.Peak] = []
    if r.ok:
        peaks, dropped = usgs.parse_peaks(r.text)
        out["peaks"] = {"n": len(peaks), "first_wy": peaks[0].water_year if peaks else None,
                        "last_wy": peaks[-1].water_year if peaks else None,
                        "dropped_no_stage": dropped,
                        "has_2017": any(p.water_year == 2017 for p in peaks),
                        "p50_ft": _pct([p.stage_ft for p in peaks], 50),
                        "p80_ft": _pct([p.stage_ft for p in peaks], 80)}
        if len(peaks) < 20:
            problem(f"only {len(peaks)} annual peaks with stage (need 20+)")
        if not out["peaks"]["has_2017"]:
            problem("no 2017 peak row (Harvey) in the peak file")
        out["comparability"] = usgs.comparability(peaks)  # F11 screen
    else:
        out["peaks"] = None
        problem(f"peak file failed: {r.error}")

    # Site metadata
    r = usgs.fetch_site(site, **kw)
    meta = usgs.parse_site(r.text) if r.ok else None
    out["site_meta"] = meta
    if not meta:
        problem("site metadata missing")
    return out


def _pct(xs: list[float], p: float) -> float | None:
    if not xs:
        return None
    s = sorted(xs)
    k = (len(s) - 1) * p / 100
    lo, hi = int(k), min(int(k) + 1, len(s) - 1)
    return round(s[lo] + (s[hi] - s[lo]) * (k - lo), 2)


def check_nws(gauges: list[dict], args) -> dict:
    """Checks 2 and 3: flood stages by USGS id, and alerts by point."""
    kw = {"offline": args.offline}
    res: dict = {"stages": {}, "alerts": {}, "problems": []}
    w, s, e, n = (float(x) for x in CFG["bbox_w_s_e_n"].split(","))
    r = nws.fetch_gauges_bbox(w, s, e, n, **kw)
    index = {}
    if r.ok:
        try:
            index = nws.index_by_usgs(r.text)
        except (ValueError, KeyError) as ex:
            res["problems"].append(f"NWPS bbox listing did not parse: {ex}")
    else:
        res["problems"].append(f"NWPS bbox listing failed: {r.error}")
    for g in gauges:
        site = g["site"]
        hit = index.get(site)
        if not hit:
            res["stages"][site] = None
            continue
        gr = nws.fetch_gauge(hit["lid"], **kw)
        res["stages"][site] = nws.parse_flood_stages(gr.text) if gr.ok else None
        meta = g.get("site_meta") or {}
        if meta.get("lat") is not None:
            ar = nws.fetch_alerts_point(meta["lat"], meta["lon"], offline=args.offline)
            if ar.ok:
                res["alerts"][site] = {"active_flood_alerts": nws.flood_alerts(ar.text)}
            else:
                res["alerts"][site] = {"error": ar.error}
    return res


def cmd_check(args) -> None:
    sites = args.sites or [c["site"] for c in CFG["candidates"]]
    gauges = [check_gauge(s, args) for s in sites]
    nws_res = check_nws(gauges, args)
    path = common.write_report("preflight_report.json", {
        "generated": datetime.now(timezone.utc).isoformat(), "gauges": gauges, "nws": nws_res})

    print(f"{'site':<10} {'recent':>7} {'harvey':>7} {'peaks':>6} {'first':>6} {'2017':>5} "
          f"{'p50':>6} {'p80':>6} {'NWS fld':>8} {'F11 steps':>10}  verdict")
    for g in gauges:
        pk = g.get("peaks") or {}
        st = (nws_res["stages"].get(g["site"]) or {}).get("minor")
        steps = len((g.get("comparability") or {}).get("steps", []))
        recent = (g.get("iv_recent") or {}).get("readings", "-")
        hv = (g.get("iv_harvey") or {}).get("readings", "-")
        verdict = "OK" if not g["problems"] else "CHECK: " + "; ".join(g["problems"])
        print(f"{g['site']:<10} {recent!s:>7} {hv!s:>7} {pk.get('n', '-')!s:>6} "
              f"{pk.get('first_wy', '-')!s:>6} {'yes' if pk.get('has_2017') else 'no':>5} "
              f"{pk.get('p50_ft', '-')!s:>6} {pk.get('p80_ft', '-')!s:>6} "
              f"{st if st is not None else '-'!s:>8} {steps:>10}  {verdict}")
    for p in nws_res["problems"]:
        print("NWS:", p)
    flooded = {k: v for k, v in nws_res["alerts"].items() if v.get("active_flood_alerts")}
    print(f"\nNWS alerts endpoint answered for {sum(1 for v in nws_res['alerts'].values() if 'error' not in v)}"
          f"/{len(gauges)} points; {len(flooded)} have an active flood alert right now.")
    print(f"Full report: {path}")
    print("Next: fill decisions.md checks 1, 2, 3; then decide the F11 record_start per gauge "
          "after reading each site's datum history on its USGS page.")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    ap.add_argument("command", choices=["discover", "check"])
    ap.add_argument("--offline", action="store_true", help="use data/cache only")
    ap.add_argument("--force", action="store_true", help="refetch discover output")
    ap.add_argument("--sites", nargs="*", help="override the candidate list")
    a = ap.parse_args()
    {"discover": cmd_discover, "check": cmd_check}[a.command](a)
