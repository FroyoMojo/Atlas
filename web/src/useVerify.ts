// Checks one payout in the browser: the transaction succeeded, its Memo carries an atlas:v3
// evidence hash, the payout is in the engine's storm record, and sha256(preimage) of the
// recorded gauge event equals that hash. It proves the payout matches a recorded reading,
// not that the reading itself is true (that is the oracle's job).
import { useConnection } from "@solana/wallet-adapter-react";
import { useCallback, useState } from "react";
import { api } from "./api";
import { memoHashFromLogs, sha256Hex } from "./evidence";
import type { StormEvent } from "./types";

export interface Check {
  label: string;
  ok: boolean;
  detail: string;
}

export interface Verdict {
  ok: boolean;
  checks: Check[];
  event: StormEvent | null;
  error?: string;
}

export function useVerify() {
  const { connection } = useConnection();
  const [results, setResults] = useState<Record<string, Verdict | "pending">>({});

  const verify = useCallback(
    async (sig: string, runId: string | null) => {
      setResults((r) => ({ ...r, [sig]: "pending" }));
      let v: Verdict;
      try {
        const tx = await connection.getTransaction(sig, { maxSupportedTransactionVersion: 0, commitment: "confirmed" });
        if (!tx) throw new Error("Transaction not found on this cluster.");
        const memoHash = memoHashFromLogs(tx.meta?.logMessages ?? []);
        const storms = await api.storms(runId ?? (await api.replayStatus()).run_id);
        const storm = storms.find((st) => st.payouts.some((p) => p.tx_sig === sig));
        const payout = storm?.payouts.find((p) => p.tx_sig === sig);
        const event = storm?.events.find((e) => e.evidence_hash === memoHash) ?? null;
        const recomputed = event ? await sha256Hex(event.preimage) : null;
        const checks: Check[] = [
          { label: "The payment went through on Solana", ok: tx.meta?.err == null, detail: tx.meta?.err ? JSON.stringify(tx.meta.err) : "no error" },
          { label: "It carries a fingerprint of a gauge reading", ok: memoHash !== null, detail: memoHash ?? "no atlas:v3 memo found" },
          { label: "It's in the storm record", ok: !!payout, detail: payout ? `${storm!.storm_id} · ${payout.amount} aUSD` : "not in this run" },
          { label: "The fingerprint matches a recorded reading", ok: !!event && recomputed === memoHash, detail: recomputed ?? "-" },
        ];
        v = { ok: checks.every((c) => c.ok), checks, event };
      } catch (e) {
        v = { ok: false, checks: [], event: null, error: String((e as Error).message ?? e) };
      }
      setResults((r) => ({ ...r, [sig]: v }));
    },
    [connection],
  );

  return { results, verify };
}
