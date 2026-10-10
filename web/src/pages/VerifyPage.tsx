import { useConnection } from "@solana/wallet-adapter-react";
import { useState } from "react";
import { api } from "../api";
import { explorer } from "../config";
import { memoHashFromLogs, sha256Hex } from "../evidence";
import type { StormEvent } from "../types";

interface Check {
  label: string;
  ok: boolean;
  detail: string;
}

export function VerifyPage() {
  const { connection } = useConnection();
  const [sig, setSig] = useState("");
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [event, setEvent] = useState<StormEvent | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function verify() {
    setChecks(null);
    setEvent(null);
    setError(null);
    const s = sig.trim();
    try {
      const tx = await connection.getTransaction(s, { maxSupportedTransactionVersion: 0, commitment: "confirmed" });
      if (!tx) throw new Error("Transaction not found on this cluster.");
      const memoHash = memoHashFromLogs(tx.meta?.logMessages ?? []);
      const status = await api.replayStatus();
      const storms = await api.storms(status.run_id);
      const storm = storms.find((st) => st.payouts.some((p) => p.tx_sig === s));
      const payout = storm?.payouts.find((p) => p.tx_sig === s);
      const memoEvent = storm?.events.find((e) => e.evidence_hash === memoHash) ?? null;
      setEvent(memoEvent);
      const recomputed = memoEvent ? await sha256Hex(memoEvent.preimage) : null;
      setChecks([
        { label: "Transaction succeeded", ok: tx.meta?.err == null, detail: tx.meta?.err ? JSON.stringify(tx.meta.err) : "no error" },
        { label: "Memo carries an atlas:v3 evidence hash", ok: memoHash !== null, detail: memoHash ?? "no atlas:v3 memo found" },
        { label: "Payout recorded in this run's storms", ok: !!payout, detail: payout ? `${storm!.storm_id} · ${payout.kind} · ${payout.amount} aUSD` : "not in this run" },
        { label: "Memo hash matches a recorded gauge event", ok: !!memoEvent, detail: memoEvent ? `${memoEvent.gauge_id} · ${memoEvent.event_id}` : "-" },
        { label: "sha256(preimage) equals the Memo hash", ok: !!recomputed && recomputed === memoHash, detail: recomputed ?? "-" },
      ]);
    } catch (e) {
      setError(String((e as Error).message ?? e));
    }
  }

  return (
    <div className="verify-page">
      <div className="card">
        <h3>Verify a payout</h3>
        <p className="muted small">
          Re-hashes the stored evidence preimage and compares it with the payout's on-chain Memo. This proves the payout matches
          a recorded reading, not that the reading itself is true; that is the oracle's job.
        </p>
        <div className="row">
          <input className="grow" placeholder="Payout transaction signature" value={sig} onChange={(e) => setSig(e.target.value)} />
          <button className="primary" onClick={verify} disabled={!sig.trim()}>Verify</button>
        </div>
        {error && <p className="error">{error}</p>}
        {checks && (
          <ul className="checks">
            {checks.map((c) => (
              <li key={c.label} className={c.ok ? "ok" : "error"}>
                <b>{c.ok ? "✓" : "✗"} {c.label}</b>
                <code>{c.detail}</code>
              </li>
            ))}
          </ul>
        )}
        {event && <p className="small muted">Preimage: <code>{event.preimage}</code></p>}
        {checks && <a href={explorer(sig.trim())} target="_blank" rel="noreferrer">Open in Solana Explorer</a>}
      </div>
    </div>
  );
}
