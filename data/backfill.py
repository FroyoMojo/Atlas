"""Load gauges, annual peaks and instantaneous history into Tiger.

  python data/backfill.py gauges --sites 08075000 08074500 ... [--pctile 70]
  python data/backfill.py peaks
  python data/backfill.py iv [--since 2007] [--harvey-only]
  python data/backfill.py all --sites ...

Every request is cached to data/cache/ before parsing, so reruns cost nothing and a crash resumes.
Run `python data/db.py schema` first, and `python data/db.py finalize` after.
Gauge rows come from preflight_report.json, so run `preflight.py check` first.

trigger_ft rule (plan 6.1): NWS flood stage (minor category) if NWPS has it, otherwise the
`--pctile` percentile of the gauge's annual peaks. The source is written to record_note.
record_start (F11): suggested by the stage-discharge screen; override with --record-start.
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timedelta, timezone

import common
import db
import usgs

CFG = json.loads((common.DATA_DIR / "gauges.json").read_text())
CHUNK = timedelta(days=90)  # keeps each iv response to roughly 17k rows


def _dt(s: str) -> datetime:
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def load_report() -> dict:
    p = common.REPORT_DIR / "preflight_report.json"
    if not p.exists():
        raise SystemExit("data/reports/preflight_report.json missing: run preflight.py check first")
    return json.loads(p.read_text())


def cmd_gauges(args) -> None:
    rep = load_report()
    by_site = {g["site"]: g for g in rep["gauges"]}
    stages = rep["nws"]["stages"]
    rows = []
    for site in args.sites:
        g = by_site.get(site)
        if not g or not g.get("site_meta") or not g.get("peaks"):
            raise SystemExit(f"{site}: not in the preflight report with metadata and peaks")
        meta, pk = g["site_meta"], g["peaks"]
        nws_stage = (stages.get(site) or {}).get("minor")
        if nws_stage is not None:
            trigger, basis = nws_stage, "NWS flood stage (minor)"
        else:
            peaks, _ = usgs.parse_peaks(usgs.fetch_peaks(site, offline=True).text)
            trigger = round(sorted(p.stage_ft for p in peaks)[
                int((len(peaks) - 1) * args.pctile / 100)], 2)
            basis = f"p{args.pctile} of annual peaks (no NWS flood stage found)"
        comp = g.get("comparability") or {}
        rs = (args.record_start or {}).get(site) or comp.get("suggested_record_start") \
            or pk["first_wy"]
        note = (f"trigger from {basis}. F11 screen: {comp.get('verdict', 'not run')}; "
                f"{len(comp.get('steps', []))} flagged block(s); record_start {rs} "
                f"({'screen suggestion' if site not in (args.record_start or {}) else 'manual'}). "
                f"Datum history on the USGS site page NOT yet read unless this note says so.")
        rows.append((site, meta["name"], meta["lat"], meta["lon"], trigger, nws_stage, rs, note))
    with db.connect() as conn:
        for r in rows:
            conn.execute(
                "INSERT INTO gauges (gauge_id, name, lat, lon, trigger_ft, nws_flood_ft, "
                "record_start, record_note) VALUES (%s,%s,%s,%s,%s,%s,%s,%s) "
                "ON CONFLICT (gauge_id) DO UPDATE SET name=EXCLUDED.name, lat=EXCLUDED.lat, "
                "lon=EXCLUDED.lon, trigger_ft=EXCLUDED.trigger_ft, "
                "nws_flood_ft=EXCLUDED.nws_flood_ft, record_start=EXCLUDED.record_start, "
                "record_note=EXCLUDED.record_note", r)
            print(f"gauge {r[0]}  trigger {r[4]} ft  record_start {r[6]}  {r[1]}")


def cmd_f11(args) -> None:
    """Apply data/f11_decisions.json to gauges.record_start and record_note."""
    dec = json.loads((common.DATA_DIR / "f11_decisions.json").read_text(encoding="utf-8-sig"))
    with db.connect() as conn:
        for site, d in dec["decisions"].items():
            note = (f" | F11 DECISION (USGS peak-file flags): record_start {d['record_start']}. "
                    f"{d['evidence']}.")
            cur = conn.execute(
                "UPDATE gauges SET record_start = %s, record_note = CASE "
                "WHEN COALESCE(record_note, '') LIKE '%%F11 DECISION%%' THEN record_note "
                "ELSE COALESCE(record_note, '') || %s END WHERE gauge_id = %s",
                (d["record_start"], note, site))
            print(f"{site}: record_start {d['record_start']} ({cur.rowcount} row)")


def cmd_peaks(args) -> None:
    with db.connect() as conn:
        sites = [r[0] for r in conn.execute("SELECT gauge_id FROM gauges ORDER BY 1")]
        for site in sites:
            r = usgs.fetch_peaks(site)
            if not r.ok:
                print(f"{site}: peaks failed: {r.error}")
                continue
            peaks, dropped = usgs.parse_peaks(r.text)
            with conn.cursor() as cur:
                cur.executemany(
                    "INSERT INTO annual_peaks (gauge_id, water_year, peak_stage_ft, peak_time) "
                    "VALUES (%s,%s,%s,%s) ON CONFLICT (gauge_id, water_year) DO UPDATE SET "
                    "peak_stage_ft=EXCLUDED.peak_stage_ft, peak_time=EXCLUDED.peak_time",
                    [(site, p.water_year, p.stage_ft, p.peak_time) for p in peaks])
            print(f"{site}: {len(peaks)} annual peaks ({dropped} dropped, no stage)")


def _windows(start: datetime, end: datetime):
    t = start
    while t < end:
        yield t, min(t + CHUNK, end)
        t += CHUNK


def _insert(conn, site: str, readings: list[usgs.Reading], max_jump: float) -> tuple[int, int]:
    """Upsert in chunks via unnest() arrays: one round trip per 5,000 rows, works on any driver
    (no COPY). Existing rows are rewritten only if the value or the rejected flag changed, so a
    reload fixes flags and picks up USGS revisions without churning identical rows."""
    flagged = usgs.flag_jumps(readings, max_jump_ft=max_jump)
    inserted = 0
    for i in range(0, len(flagged), 5000):
        chunk = flagged[i:i + 5000]
        cur = conn.execute(
            "INSERT INTO gauge_readings (event_time, gauge_id, stage_ft, discharge_cfs, "
            "source, run_id, rejected) "
            "SELECT u.t, %s::text, u.s, u.q, 'usgs', 'live', u.j "
            "FROM unnest(%s::timestamptz[], %s::float8[], %s::float8[], %s::bool[]) "
            "AS u(t, s, q, j) "
            "ON CONFLICT (gauge_id, event_time, source, run_id) DO UPDATE SET "
            "stage_ft = EXCLUDED.stage_ft, discharge_cfs = EXCLUDED.discharge_cfs, "
            "rejected = EXCLUDED.rejected "
            "WHERE gauge_readings.rejected IS DISTINCT FROM EXCLUDED.rejected "
            "OR gauge_readings.stage_ft IS DISTINCT FROM EXCLUDED.stage_ft "
            "OR gauge_readings.discharge_cfs IS DISTINCT FROM EXCLUDED.discharge_cfs",
            (site, [r.event_time for r, _ in chunk], [r.stage_ft for r, _ in chunk],
             [r.discharge_cfs for r, _ in chunk], [rej for _, rej in chunk]))
        inserted += max(cur.rowcount, 0)
    return inserted, sum(1 for _, rej in flagged if rej)


def cmd_iv(args) -> None:
    now = datetime.now(timezone.utc)
    hw = (_dt(CFG["harvey_fetch_window"]["start"]), _dt(CFG["harvey_fetch_window"]["end"]))
    since = datetime(args.since or CFG["iv_history_start_year"], 1, 1, tzinfo=timezone.utc)
    with db.connect() as conn:
        sites = [r[0] for r in conn.execute("SELECT gauge_id FROM gauges ORDER BY 1")]
        if args.sites:
            sites = [s for s in sites if s in args.sites]
        if not sites:
            raise SystemExit("no gauges to load: run `backfill.py gauges` first")
        # Harvey window first so decision #4 can be answered early, then the rest, newest first.
        plans = [("harvey", [(hw[0], hw[1])])]
        if not args.harvey_only:
            plans.append(("history", list(reversed(list(_windows(since, now))))))
        for label, wins in plans:
            for site in sites:
                tot_in = tot_rej = failed = 0
                for a, b in wins:
                    r = usgs.fetch_iv(site, a, b)
                    if not r.ok:
                        failed += 1
                        print(f"  {site} {a:%Y-%m-%d}: {r.error}")
                        continue
                    ins, rej = _insert(conn, site, usgs.parse_iv(r.text), args.max_jump)
                    tot_in += ins
                    tot_rej += rej
                print(f"[{label}] {site}: inserted {tot_in}, rejected-flagged {tot_rej}, "
                      f"failed windows {failed}/{len(wins)}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    ap.add_argument("command", choices=["gauges", "peaks", "iv", "all", "f11"])
    ap.add_argument("--sites", nargs="*", default=[])
    ap.add_argument("--pctile", type=float, default=70)
    ap.add_argument("--record-start", nargs="*", default=[], metavar="SITE=YEAR")
    ap.add_argument("--since", type=int)
    ap.add_argument("--harvey-only", action="store_true")
    ap.add_argument("--max-jump", type=float, default=3.0, help="feet per 15 min")
    a = ap.parse_args()
    a.record_start = {k: int(v) for k, v in (s.split("=") for s in a.record_start)} or None
    if a.command in ("gauges", "all"):
        if not a.sites:
            raise SystemExit("--sites is required")
        cmd_gauges(a)
    if a.command == "f11":
        cmd_f11(a)
    if a.command in ("peaks", "all"):
        cmd_peaks(a)
    if a.command in ("iv", "all"):
        cmd_iv(a)


if __name__ == "__main__":
    main()

