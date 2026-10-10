import { useConnection } from "@solana/wallet-adapter-react";
import { useState } from "react";
import { api } from "../api";
import { explorer } from "../config";
import { evidenceHash, evidenceString, memoHashFromLogs } from "../evidence";
import type { TriggerEvent } from "../types";

interface Check {
  label: string;
  ok: boolean;
  detail: string;
}

export function VerifyPage() {
  const { connection } = useConnection();
  const [sig, setSig] = useState("");
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [event, setEvent] = useState<TriggerEvent | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function verify() {
    setChecks(null);
    setEvent(null);
    setError(null);
    try {
      const tx = await connection.getTransaction(sig.trim(), { maxSupportedTransactionVersion: 0, commitment: "confirmed" });
      if (!tx) throw new Error("Transaction not found on this cluster.");
      const memoHash = memoHashFromLogs(tx.meta?.logMessages ?? []);
      const events = await api.events(null);
      const ev = events.find((e) => e.payouts.some((p) => p.tx_sig === sig.trim())) ?? null;
      setEvent(ev);
      const recomputed = ev ? await evidenceHash(ev) : null;
      setChecks([
        { label: "Transaction succeeded", ok: tx.meta?.err == null, detail: tx.meta?.err ? JSON.stringify(tx.meta.err) : "no error" },
        { label: "Memo carries an evidence hash", ok: memoHash !== null, detail: memoHash ?? "no atlas:v1 memo found" },
        { label: "Payout found in the recorded trigger events", ok: ev !== null, detail: ev ? `${ev.gauge_id} · wave ${ev.wave_id} · run ${ev.run_id}` : "not in this run's events" },
        { label: "Memo hash matches the recorded event", ok: !!ev && memoHash === ev.evidence_hash, detail: ev?.evidence_hash ?? "-" },
        { label: "Hash recomputed from the reading matches", ok: !!recomputed && recomputed === memoHash, detail: recomputed ?? "-" },
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
          Checks that a payout's Memo hash matches the gauge reading it acted on. This is an audit trail: it shows the payout
          matches a recorded reading, not that the reading itself is true.
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
        {event && <p className="small muted">Hashed string: <code>{evidenceString(event)}</code></p>}
        {checks && <a href={explorer(sig.trim())} target="_blank" rel="noreferrer">Open in Solana Explorer</a>}
      </div>
    </div>
  );
}
