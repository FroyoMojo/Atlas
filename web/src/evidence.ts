// Browser side of the canonical evidence format (plan v3 8.7, docs/evidence.md):
//   atlas|v3|{gauge_id}|{value}|{event_time}|{run_id}|{storm_id}|{event_id}|{feed}|{slot}
// The verify page re-hashes the stored preimage and compares it with the Memo on-chain.

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function memoHashFromLogs(logs: string[]): string | null {
  for (const line of logs) {
    const m = /atlas:v3:([0-9a-f]{64})/.exec(line);
    if (m) return m[1];
  }
  return null;
}
