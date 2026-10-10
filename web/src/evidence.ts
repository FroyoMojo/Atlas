// Browser copy of the evidence-hash recipe in chain/src/lib/memo.ts and docs/api.md:
//   sha256( gauge_id | value_ft (2 decimals) | unix_seconds | run_id | wave_id | feed_account | feed_slot )
import type { TriggerEvent } from "./types";

export function evidenceString(e: TriggerEvent): string {
  const useFeed = e.feed_value != null;
  return [
    e.gauge_id,
    (useFeed ? e.feed_value! : e.reading_ft).toFixed(2),
    Math.floor(new Date(e.time).getTime() / 1000).toString(),
    e.run_id,
    e.wave_id,
    useFeed ? (e.feed_account ?? "") : "",
    useFeed && e.feed_slot != null ? String(e.feed_slot) : "",
  ].join("|");
}

export async function evidenceHash(e: TriggerEvent): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(evidenceString(e)));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function memoHashFromLogs(logs: string[]): string | null {
  for (const line of logs) {
    const m = /atlas:v1:([0-9a-f]{64})/.exec(line);
    if (m) return m[1];
  }
  return null;
}
