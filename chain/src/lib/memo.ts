// Memo instructions and the canonical evidence preimage (plan v3 section 8.7, docs/evidence.md).
//
//   atlas|v3|{gauge_id}|{value}|{event_time}|{run_id}|{storm_id}|{event_id}|{feed}|{slot}
//
// value: latched triggering value, exactly 2 decimals. event_time: the event's opened_at, UTC,
// ISO 8601 to the second with a trailing Z. feed/slot: Switchboard feed and slot, or "-".
// Hash: SHA-256 of the UTF-8 preimage, lowercase hex. Memo text: atlas:v3:<hash>.
// The engine computes and stores the preimage; the bot re-hashes it before paying.
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { createHash } from "node:crypto";

export const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

export function memoIx(text: string): TransactionInstruction {
  return new TransactionInstruction({ programId: MEMO_PROGRAM_ID, keys: [], data: Buffer.from(text, "utf8") });
}

export interface EvidenceFields {
  gaugeId: string;
  value: number;
  eventTime: Date;
  runId: string;
  stormId: string;
  eventId: string;
  feed?: string | null;
  slot?: number | string | null;
}

/** 2026-10-11T03:15:00Z: whole seconds, no milliseconds, UTC. */
export function isoSecondsZ(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function evidencePreimage(f: EvidenceFields): string {
  return [
    "atlas",
    "v3",
    f.gaugeId,
    f.value.toFixed(2),
    isoSecondsZ(f.eventTime),
    f.runId,
    f.stormId,
    f.eventId,
    f.feed || "-",
    f.slot != null && f.slot !== "" ? String(f.slot) : "-",
  ].join("|");
}

export function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function evidenceMemo(hash: string): string {
  return `atlas:v3:${hash}`;
}

export function parseEvidenceMemo(text: string): string | null {
  const m = /atlas:v3:([0-9a-f]{64})/.exec(text);
  return m ? m[1] : null;
}
