// The run every page shows, plus the clock conversions the replay card and feed need.
// The engine shifts Harvey readings to "now" (event_time = original + shift), so historic
// time = event time - shift_seconds.
import { useEffect, useState } from "react";
import { activeRunId, api } from "./api";
import { usePoll } from "./usePoll";

const TZ = "America/Chicago";

export function useReplay() {
  const { data: replay } = usePoll(api.replayStatus, 1000);
  const runId = activeRunId(replay);
  const isReplay = !!runId && (replay?.status === "running" || replay?.status === "done");
  const shift = replay?.shift_seconds ?? null;

  /** Event time as it happened in 2017 (unchanged if the run has no shift yet). */
  const historic = (t: string | null | undefined): Date | null => {
    if (!t) return null;
    const ms = Date.parse(t);
    return new Date(isReplay && shift != null ? ms - shift * 1000 : ms);
  };

  // Progress ticks locally between polls so the bar moves smoothly.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (replay?.status !== "running") return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [replay?.status]);
  let progress = 0;
  if (replay?.status === "done") progress = 1;
  else if (replay?.status === "running" && replay.started_wall && replay.replay_seconds)
    progress = Math.max(0, Math.min(1, (now - Date.parse(replay.started_wall)) / (replay.replay_seconds * 1000)));

  return { replay, runId, isReplay, historic, progress };
}

export const fmtDateTime = (d: Date | null) =>
  d
    ? `${d.toLocaleDateString("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric", year: "numeric" })} · ${d.toLocaleTimeString("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" })}`
    : "";
export const fmtTime = (d: Date | null) => (d ? d.toLocaleTimeString("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" }) : "");
export const fmtDay = (d: Date | null) => (d ? d.toLocaleDateString("en-US", { timeZone: TZ, month: "short", day: "numeric" }) : "");
export const fmtWeekday = (d: Date | null) => (d ? d.toLocaleDateString("en-US", { timeZone: TZ, weekday: "short" }) : "");
