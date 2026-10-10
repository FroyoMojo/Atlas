// Memo instructions and the evidence hash that links a payout to the reading it acted on.
//
// The hash recipe is shared with the engine (Python) and the verify page, so it must stay
// byte-identical everywhere. It is documented in docs/api.md:
//   sha256( gauge_id | value_ft (2 decimals) | unix_seconds | run_id | wave_id | feed_account | feed_slot )
// Empty strings stand in for the feed fields when Switchboard is not used.
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { createHash } from "node:crypto";

export const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

export function memoIx(text: string): TransactionInstruction {
  return new TransactionInstruction({
    programId: MEMO_PROGRAM_ID,
    keys: [],
    data: Buffer.from(text, "utf8"),
  });
}

export interface EvidenceFields {
  gaugeId: string;
  valueFt: number;
  time: Date;
  runId: string;
  waveId: string;
  feedAccount?: string;
  feedSlot?: number;
}

export function evidenceString(f: EvidenceFields): string {
  return [
    f.gaugeId,
    f.valueFt.toFixed(2),
    Math.floor(f.time.getTime() / 1000).toString(),
    f.runId,
    f.waveId,
    f.feedAccount ?? "",
    f.feedSlot?.toString() ?? "",
  ].join("|");
}

export function evidenceHash(f: EvidenceFields): string {
  return createHash("sha256").update(evidenceString(f)).digest("hex");
}

export function evidenceMemo(hash: string): string {
  return `atlas:v1:${hash}`;
}

export function parseEvidenceMemo(text: string): string | null {
  const m = /atlas:v1:([0-9a-f]{64})/.exec(text);
  return m ? m[1] : null;
}
