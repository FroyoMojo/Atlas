"""Time-shifted replay streamer with event and storm logic (plan v3.1 sections 4.3, 6.3, 6.4, 7.5).

Replays stored USGS readings (source 'usgs', run 'live') from the Harvey window as source
'replay' for one run, squeezed into REPLAY_SECONDS of wall time:

- Window: 48 h before the first demo gauge crosses its trigger to 24 h after the last demo peak,
  searched inside REPLAY_SEARCH_START..REPLAY_SEARCH_END, or fixed by REPLAY_WINDOW_START/END.
- Shift: event_time = original_time + (started_wall - window_start); runs.clock = event time of
  the last reading written.
- Guard: a reading that moved more than REPLAY_MAX_JUMP_FT per 15 minutes since the gauge's last
  accepted reading is written with rejected = true and ignored by the event logic. The allowance
  grows with the gap, because gauges drop out mid-flood (gaps of 13 to 99 h in Harvey). The
  loader (data/usgs.py) also flags spikes that jump away and straight back; those arrive here
  with rejected = true.
- Events: open after two consecutive accepted readings at or above trigger_ft (one open event
  per gauge per run); close after 72 h of event time below trigger. Preimage per docs/evidence.md.
- Storms: the first event opens a storm and sets f_int = min(1, A / exposure of the at-risk set);
  later events join it. It closes when all its events close, or at the end of the replay, with
  f_fin = max(f_int, min(1, A / exposure of the triggered gauges)). FORCE_F_INT overrides f_int.
- Sales freeze: a flood_watch replay_alert per crossing gauge from 24 h before its first crossing.

Started by POST /replay/start in a background thread (or REPLAY_CMD instead), stopped by reset.
CLI for testing: python -m app.replay --run RUN_ID (from engine/; the run row must exist).
"""
import argparse
import datetime as dt
import logging
import os
import threading
import time
from dataclasses import dataclass, field

import psycopg
from psycopg.rows import dict_row

from . import settings
from .evidence import evidence_hash, preimage

log = logging.getLogger("atlas.replay")
H = dt.timedelta(hours=1)
CLOSE_AFTER = 72 * H


def _env_time(name: str, default: str | None) -> dt.datetime | None:
    """ISO time from the environment; a value without a timezone is UTC (not server local time)."""
    v = settings.env_str(name) or default
    if not v:
        return None
    t = dt.datetime.fromisoformat(v.replace("Z", "+00:00"))
    return (t if t.tzinfo else t.replace(tzinfo=dt.timezone.utc)).astimezone(dt.timezone.utc)


@dataclass
class GaugeState:
    trigger: float
    last_accepted: float | None = None
    last_accepted_at: dt.datetime | None = None
    above_run: int = 0
    last_above: dt.datetime | None = None
    open_event: str | None = None


@dataclass
class Storm:
    storm_id: str
    events: dict[str, bool] = field(default_factory=dict)   # event_id -> closed
    f_int: float = 1.0


def first_crossing(points: list[tuple[dt.datetime, float]], trigger: float) -> dt.datetime | None:
    run = 0
    for t, s in points:
        run = run + 1 if s >= trigger else 0
        if run == 2:
            return t
    return None


def find_window(conn, gauges: dict[str, dict]) -> tuple[dt.datetime, dt.datetime]:
    start, end = _env_time("REPLAY_WINDOW_START", None), _env_time("REPLAY_WINDOW_END", None)
    if start and end:
        return start, end
    lo = _env_time("REPLAY_SEARCH_START", "2017-08-23T00:00:00Z")
    hi = _env_time("REPLAY_SEARCH_END", "2017-09-05T00:00:00Z")
    crossings, peaks = [], []
    for gid, g in gauges.items():
        if not g["demo_ready"]:
            continue
        pts = [(r["event_time"], r["stage_ft"]) for r in conn.execute(
            """SELECT event_time, stage_ft FROM gauge_readings WHERE gauge_id = %s AND run_id = 'live'
               AND NOT rejected AND stage_ft IS NOT NULL AND event_time >= %s AND event_time < %s ORDER BY event_time""",
            (gid, lo, hi))]
        c = first_crossing(pts, g["trigger_ft"])
        if c:
            crossings.append(c)
            peaks.append(max(pts, key=lambda p: p[1])[0])
    if not crossings:
        raise RuntimeError("No demo_ready gauge crosses its trigger in the stored replay window")
    return max(lo, min(crossings) - 48 * H), min(hi, max(peaks) + 24 * H)


class Replay:
    def __init__(self, run_id: str, stop: threading.Event | None = None, seconds: float | None = None):
        self.run_id = run_id
        self.stop = stop or threading.Event()
        self.seconds = seconds if seconds is not None else float(settings.env_str("REPLAY_SECONDS") or 64)
        self.max_jump = float(settings.env_str("REPLAY_MAX_JUMP_FT") or 5)
        self.force_f_int = settings.env_str("FORCE_F_INT") or None
        self.storm: Storm | None = None
        self.n_storms = self.n_events = 0

    # ---------- pay factors (7.5) ----------

    def available(self, conn) -> float:
        """A = R + C at storm open: the vault (reserve + bond) at the start of the run."""
        r = conn.execute("SELECT opening_vault FROM runs WHERE run_id = %s", (self.run_id,)).fetchone()
        return float(r["opening_vault"]) if r and r["opening_vault"] is not None else settings.SNAPSHOT_VAULT

    @staticmethod
    def exposure(conn, gauge_ids: set[str], at: dt.datetime, statuses: tuple[str, ...]) -> float:
        if not gauge_ids:
            return 0.0
        r = conn.execute(
            """SELECT coalesce(sum(payout_usd), 0) AS b FROM policies
               WHERE gauge_id = ANY(%s) AND status = ANY(%s) AND starts_at <= %s AND %s < ends_at""",
            (list(gauge_ids), list(statuses), at, at)).fetchone()
        return float(r["b"])

    def f_int(self, conn, gauge_id: str, at: dt.datetime) -> float:
        if self.force_f_int:
            return float(self.force_f_int)
        at_risk = {r["gauge_id"] for r in conn.execute(
            "SELECT DISTINCT gauge_id FROM replay_alerts WHERE run_id = %s AND starts_at <= %s AND ends_at > %s",
            (self.run_id, at, at))} | {gauge_id}
        b = self.exposure(conn, at_risk, at, ("ACTV",))
        return min(1.0, self.available(conn) / b) if b > 0 else 1.0

    def f_fin(self, conn, storm_id: str) -> float:
        # One row per gauge (its first event in the storm), so a gauge is never counted twice.
        rows = conn.execute("""SELECT gauge_id, min(opened_at) AS opened_at FROM gauge_events
                               WHERE storm_id = %s GROUP BY gauge_id""", (storm_id,)).fetchall()
        b = sum(self.exposure(conn, {r["gauge_id"]}, r["opened_at"], ("ACTV", "PAID")) for r in rows)
        f = min(1.0, self.available(conn) / b) if b > 0 else 1.0
        return max(f, self.storm.f_int if self.storm else 0.0)

    # ---------- events and storms ----------

    def open_event(self, conn, gid: str, g: GaugeState, t: dt.datetime, value: float) -> None:
        if self.storm is None:
            self.n_storms += 1
            sid = f"{self.run_id}-s{self.n_storms}"
            f = self.f_int(conn, gid, t)
            conn.execute("INSERT INTO storms (storm_id, run_id, opened_at, f_int, status) VALUES (%s, %s, %s, %s, 'open')",
                         (sid, self.run_id, t, f))
            self.storm = Storm(sid, f_int=f)
            log.info("storm %s opened at %s, f_int %.4f", sid, t, f)
        self.n_events += 1
        eid = f"{self.run_id}-e{self.n_events}"
        pre = preimage(gid, value, t, self.run_id, self.storm.storm_id, eid)
        conn.execute(
            """INSERT INTO gauge_events (event_id, run_id, storm_id, gauge_id, opened_at, latched_value, preimage, evidence_hash)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""",
            (eid, self.run_id, self.storm.storm_id, gid, t, round(value, 2), pre, evidence_hash(pre)))
        g.open_event = eid
        self.storm.events[eid] = False
        log.info("event %s: gauge %s at %.2f ft (trigger %.2f) %s", eid, gid, value, g.trigger, t)

    def close_event(self, conn, g: GaugeState, t: dt.datetime) -> None:
        conn.execute("UPDATE gauge_events SET closed_at = %s WHERE event_id = %s", (t, g.open_event))
        if self.storm and g.open_event in self.storm.events:
            self.storm.events[g.open_event] = True
        g.open_event = None

    def close_storm(self, conn, t: dt.datetime) -> None:
        f = self.f_fin(conn, self.storm.storm_id)
        conn.execute("UPDATE storms SET closed_at = %s, f_fin = %s, status = 'closed' WHERE storm_id = %s AND status = 'open'",
                     (t, f, self.storm.storm_id))
        log.info("storm %s closed at %s, f_fin %.4f", self.storm.storm_id, t, f)
        self.storm = None

    # ---------- main loop ----------

    def run(self) -> str:
        """Returns 'done', or 'stopped' if reset stopped it first."""
        with psycopg.connect(settings.DATABASE_URL, row_factory=dict_row) as conn:
            gauges = {r["gauge_id"]: r for r in conn.execute("SELECT * FROM gauges")}
            # Replay only the gauges we cover: a non-demo gauge going red on stage, or opening
            # an event in the storm, is confusing and adds nothing. REPLAY_DEMO_ONLY=false to stream all.
            if settings.env_str("REPLAY_DEMO_ONLY", "true").lower() in ("true", "1", "yes"):
                demo = {k: v for k, v in gauges.items() if v["demo_ready"]}
                gauges = demo or gauges
            run = conn.execute("SELECT * FROM runs WHERE run_id = %s", (self.run_id,)).fetchone()
            if run is None:
                raise RuntimeError(f"run {self.run_id} does not exist")
            w0, w1 = find_window(conn, gauges)
            shift = run["started_wall"].replace(microsecond=0) - w0
            rows = conn.execute(
                """SELECT event_time, gauge_id, stage_ft, discharge_cfs, rejected FROM gauge_readings
                   WHERE run_id = 'live' AND gauge_id = ANY(%s) AND event_time >= %s AND event_time <= %s
                   ORDER BY event_time, gauge_id""",
                (list(gauges), w0, w1)).fetchall()
            steps: list[list[dict]] = []
            for r in rows:
                if not steps or steps[-1][0]["event_time"] != r["event_time"]:
                    steps.append([])
                steps[-1].append(r)
            if not steps:
                raise RuntimeError("No stored readings in the replay window")

            # Sales freeze: a flood watch per crossing gauge from 24 h before its first crossing.
            for gid, g in gauges.items():
                pts = [(r["event_time"], r["stage_ft"]) for r in rows
                       if r["gauge_id"] == gid and not r["rejected"] and r["stage_ft"] is not None]
                c = first_crossing(pts, g["trigger_ft"])
                if c:
                    conn.execute("INSERT INTO replay_alerts VALUES (%s, %s, %s, %s, 'flood_watch')",
                                 (self.run_id, gid, max(w0, c - 24 * H) + shift, w1 + shift))
            conn.execute("UPDATE runs SET shift = %s WHERE run_id = %s", (shift, self.run_id))
            conn.commit()
            log.info("run %s: window %s to %s, %d steps over %.0f s, shift %s",
                     self.run_id, w0, w1, len(steps), self.seconds, shift)

            state = {gid: GaugeState(g["trigger_ft"]) for gid, g in gauges.items()}
            per_step = self.seconds / len(steps)
            t_start = time.monotonic()
            i = 0
            clock = None
            while i < len(steps):
                if self.stop.is_set():
                    return "stopped"
                due = min(len(steps), int((time.monotonic() - t_start) / per_step) + 1) if per_step > 0 else len(steps)
                batch = []
                while i < due:
                    for r in steps[i]:
                        batch.append(self.accept(conn, state, r, shift))
                    clock = steps[i][0]["event_time"] + shift
                    i += 1
                    if self.storm and all(self.storm.events.values()):
                        self.close_storm(conn, clock)
                if batch:
                    with conn.cursor() as cur:
                        cur.executemany(
                            """INSERT INTO gauge_readings (event_time, gauge_id, stage_ft, discharge_cfs, source, run_id, rejected)
                               VALUES (%s, %s, %s, %s, 'replay', %s, %s)
                               ON CONFLICT (gauge_id, event_time, source, run_id) DO NOTHING""", batch)
                    conn.execute("UPDATE runs SET clock = %s WHERE run_id = %s", (clock, self.run_id))
                    conn.commit()
                if i < len(steps):
                    self.stop.wait(max(0.0, t_start + i * per_step - time.monotonic()))

            # End of the replay: close open events and the storm at the run clock.
            for g in state.values():
                if g.open_event:
                    self.close_event(conn, g, clock)
            if self.storm:
                self.close_storm(conn, clock)
            conn.execute("UPDATE runs SET status = 'done' WHERE run_id = %s AND status = 'running'", (self.run_id,))
            conn.commit()
            log.info("run %s done: %d storm(s), %d event(s)", self.run_id, self.n_storms, self.n_events)
            return "done"

    def accept(self, conn, state: dict[str, GaugeState], r: dict, shift: dt.timedelta) -> tuple:
        """Data-quality guard, then the event rule. Returns the row to insert."""
        g = state.get(r["gauge_id"])
        t = r["event_time"] + shift
        stage = r["stage_ft"]
        # No stage (discharge only, or the gauge was dark) is a gap, not a rejected reading.
        rejected = bool(r["rejected"])
        if stage is not None and not rejected and g is not None and g.last_accepted is not None:
            steps = max(1.0, (t - g.last_accepted_at) / dt.timedelta(minutes=15))
            rejected = abs(stage - g.last_accepted) > self.max_jump * steps
        if g is not None and stage is not None and not rejected:
            g.last_accepted, g.last_accepted_at = stage, t
            if stage >= g.trigger:
                g.above_run += 1
                g.last_above = t
                if g.above_run >= 2 and g.open_event is None:
                    self.open_event(conn, r["gauge_id"], g, t, stage)
            else:
                g.above_run = 0
                if g.open_event and g.last_above and t - g.last_above >= CLOSE_AFTER:
                    self.close_event(conn, g, t)
        return (t, r["gauge_id"], stage, r["discharge_cfs"], self.run_id, rejected)


def finish_failed(run_id: str) -> None:
    """A replay that crashed must not stay "running" with an open storm: close its open events
    and storms at the run clock (f_fin = f_int, so no true-up is invented) and mark it done."""
    try:
        with psycopg.connect(settings.DATABASE_URL, row_factory=dict_row) as conn:
            run = conn.execute("SELECT clock, status FROM runs WHERE run_id = %s", (run_id,)).fetchone()
            if not run or run["status"] != "running":
                return
            at = run["clock"] or dt.datetime.now(dt.timezone.utc)
            conn.execute("UPDATE gauge_events SET closed_at = %s WHERE run_id = %s AND closed_at IS NULL", (at, run_id))
            conn.execute("""UPDATE storms SET closed_at = %s, f_fin = f_int, status = 'closed'
                            WHERE run_id = %s AND status = 'open'""", (at, run_id))
            conn.execute("UPDATE runs SET status = 'done' WHERE run_id = %s AND status = 'running'", (run_id,))
            conn.commit()
        log.warning("run %s marked done after the replay failed", run_id)
    except Exception:
        log.exception("could not close failed run %s", run_id)


# ---------- background thread used by the engine ----------

_thread: threading.Thread | None = None
_stop: threading.Event | None = None


def start_thread(run_id: str) -> None:
    global _thread, _stop
    stop_thread()
    _stop = threading.Event()

    def target(stop=_stop):
        try:
            Replay(run_id, stop).run()
        except Exception:
            log.exception("replay %s failed", run_id)
            finish_failed(run_id)

    _thread = threading.Thread(target=target, name=f"replay-{run_id}", daemon=True)
    _thread.start()


def stop_thread() -> None:
    global _thread, _stop
    if _stop:
        _stop.set()
    if _thread:
        _thread.join(30)
    _thread = _stop = None


def running() -> bool:
    return bool(_thread and _thread.is_alive())


def main():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
    p = argparse.ArgumentParser(description="Replay one run (the run row must exist).")
    p.add_argument("--run", default=os.environ.get("RUN_ID"), required=not os.environ.get("RUN_ID"))
    p.add_argument("--seconds", type=float)
    a = p.parse_args()
    try:
        print(Replay(a.run, seconds=a.seconds).run())
    except Exception:
        finish_failed(a.run)
        raise


if __name__ == "__main__":
    main()
