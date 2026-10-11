import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { areaOf } from "../areas";
import { explorer, short } from "../config";
import { CheckIcon, Contours, usd } from "../components/ui";
import type { StormPayout } from "../types";
import { usePoll } from "../usePoll";
import { fmtDateTime, fmtTime, useReplay } from "../useReplay";
import { useVerify, type Verdict } from "../useVerify";

export function ProofPage() {
  const [params] = useSearchParams();
  const linked = params.get("sig");
  const { runId, historic } = useReplay();
  const { data: pool, error } = usePoll(() => api.pool(runId), 1500, [runId]);
  const { data: storms } = usePoll(() => api.storms(runId), 1500, [runId]);
  const { data: gauges } = usePoll(() => api.gauges(runId), 5000, [runId]);
  const { data: harvey } = usePoll(() => api.stress("harvey"), 60_000);
  const { results, verify } = useVerify();

  const payouts = storms?.flatMap((s) => s.payouts.map((p) => ({ ...p, storm: s }))) ?? [];
  useEffect(() => {
    if (linked) verify(linked, runId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linked]);

  const setAside = pool ? pool.onchain.reserve + pool.onchain.bond_capital + pool.onchain.float : null;
  const [manual, setManual] = useState("");
  const [showManual, setShowManual] = useState(false);

  const because = (v: Verdict) => {
    const e = v.event;
    if (!e) return null;
    const g = gauges?.find((x) => x.gauge_id === e.gauge_id);
    const { area, river } = areaOf(g, e.gauge_id);
    return `Paid because ${river} hit ${e.value.toFixed(2)} ft in ${area} (${fmtDateTime(historic(e.opened_at))}). The payment carries a fingerprint of that USGS reading, and your browser just recomputed it.`;
  };

  const row = (p: StormPayout & { storm?: { events: { gauge_id: string; opened_at: string }[] } }, hl = false) => {
    const v = results[p.tx_sig];
    const first = p.storm?.events[0];
    const where = first ? areaOf(gauges?.find((g) => g.gauge_id === first.gauge_id), first.gauge_id).area : null;
    return (
      <div key={p.tx_sig} className={`payout ${hl ? "hl" : ""}`}>
        <div className="payout-row">
          <b>{p.policy ? `${usd(p.amount)} to policy ${short(p.policy)}${p.kind === "trueup" ? " · the rest" : ""}` : `Payment ${short(p.tx_sig, 6)}`}</b>
          {where && first && <span>{where} · {fmtTime(historic(first.opened_at))}</span>}
          {v === undefined && <button className="btn btn-outline" style={{ minHeight: 36, padding: "6px 14px", fontSize: 14 }} onClick={() => verify(p.tx_sig, runId)}>Verify</button>}
          {v === "pending" && <span className="small muted">Checking…</span>}
          {v && v !== "pending" && (
            <span className={`check ${v.ok ? "ok" : "bad"}`}><CheckIcon ok={v.ok} />{v.ok ? "Verified" : "Didn't match"}</span>
          )}
        </div>
        {v && v !== "pending" && (
          <div className="payout-why">
            {v.ok ? because(v) : v.error ?? `Failed: ${v.checks.filter((c) => !c.ok).map((c) => c.label.toLowerCase()).join("; ")}.`}{" "}
            <a href={explorer(p.tx_sig)} target="_blank" rel="noreferrer">See it on Solana Explorer</a>
          </div>
        )}
      </div>
    );
  };

  const linkedListed = linked && payouts.some((p) => p.tx_sig === linked);
  const total = harvey ? harvey.aggregate_loss : 0;
  const pct = (n: number) => `${total > 0 ? Math.max(0, Math.min(100, (n / total) * 100)) : 0}%`;

  return (
    <>
      <div className="hero pad-mid">
        <Contours />
        <section className="hero-body center">
          <h1 style={{ fontSize: 46 }}>Don't trust us. Check.</h1>
          <p>Every number here comes straight from the blockchain.</p>
        </section>
      </div>

      <div className="page">
        <section className="lift money-card">
          <div>
            <span>Money set aside</span>
            <span className="big-num">{setAside == null ? "–" : usd(setAside)}</span>
          </div>
          <div>
            <span>Paid out this storm</span>
            <span className="big-num">{pool ? usd(pool.onchain.payouts_out) : "–"}</span>
          </div>
          {pool && (
            <span className={`check ${pool.onchain.reconciled ? "ok" : "bad"}`}>
              <CheckIcon ok={pool.onchain.reconciled} size={18} />
              {pool.onchain.reconciled ? "Matches the blockchain" : "Doesn't match yet: rechecking"}
            </span>
          )}
          {error && <p className="error small" style={{ flexBasis: "100%", margin: 0 }}>{error}</p>}
        </section>

        <section className="stack">
          <h2 className="section-title" style={{ fontSize: 22 }}>Payouts</h2>
          <div className="payouts">
            {linked && !linkedListed && row({ policy: "", kind: "interim", amount: 0, tx_sig: linked } as StormPayout, true)}
            {payouts.map((p) => row(p, p.tx_sig === linked))}
            {!payouts.length && !linked && (
              <div className="payout"><span className="muted">No payouts yet. They appear here the moment a covered river floods.</span></div>
            )}
          </div>
          {showManual ? (
            <form className="payout-row" onSubmit={(e) => (e.preventDefault(), manual.trim() && verify(manual.trim(), runId))}>
              <input className="input" style={{ flex: "1 1 320px" }} placeholder="Payment transaction ID" value={manual} onChange={(e) => setManual(e.target.value)} />
              <button className="btn btn-primary" disabled={!manual.trim()}>Check</button>
            </form>
          ) : (
            <button className="why-link" style={{ alignSelf: "flex-start", fontSize: 14 }} onClick={() => setShowManual(true)}>
              Check any payment by its transaction ID
            </button>
          )}
          {showManual && manual.trim() && results[manual.trim()] && !payouts.some((p) => p.tx_sig === manual.trim()) && (
            <div className="payouts">{row({ policy: "", kind: "interim", amount: 0, tx_sig: manual.trim() } as StormPayout)}</div>
          )}
        </section>

        <section className="stack">
          <h2 className="section-title" style={{ fontSize: 22 }}>Could it survive another Harvey?</h2>
          <div className="card harvey">
            {harvey ? (
              <>
                <div className="harvey-bar" role="img" aria-label="How a Harvey-sized loss is paid">
                  <div style={{ width: pct(harvey.reserve_used), background: "#0A3A5F" }} />
                  <div style={{ width: pct(harvey.bond_used), background: "#4E8BC0" }} />
                </div>
                <div className="harvey-legend">
                  <span><i className="dot" style={{ background: "#0A3A5F" }} />Premiums</span>
                  <span><i className="dot" style={{ background: "#4E8BC0" }} />Bond investors</span>
                  {harvey.f_fin < 0.999 && <span><i className="dot" style={{ background: "#EAEEF3" }} />Not covered</span>}
                </div>
                <span style={{ fontSize: 15, lineHeight: 1.5 }}>
                  {harvey.f_fin >= 0.999 ? (
                    <>Yes. A Harvey-sized loss of <strong>{usd(harvey.aggregate_loss)}</strong> is covered by premiums and bond investors, so every household is paid in full.</>
                  ) : (
                    <>Mostly. A Harvey-sized loss of <strong>{usd(harvey.aggregate_loss)}</strong> would use all of it, and every household would get the same <strong>{Math.round(harvey.f_fin * 100)}%</strong> of their payment.</>
                  )}{" "}
                  <Link to="/invest">Invest in the bond →</Link>
                </span>
              </>
            ) : (
              <span className="muted">Loading the stress test…</span>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
