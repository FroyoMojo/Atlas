import { useWallet } from "@solana/wallet-adapter-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { explorer } from "../config";
import { Contours, usd } from "../components/ui";
import { friendlyError } from "../errors";
import { useRole } from "../role";
import { usePoll } from "../usePoll";
import { useReplay } from "../useReplay";
import { useConnectWallet, useServerTx } from "../wallet";

export function InvestPage() {
  const { runId } = useReplay();
  const { role, setRole } = useRole();
  const { data: pool } = usePoll(() => api.pool(runId), 3000, [runId]);
  const { data: harvey } = usePoll(() => api.stress("harvey"), 60_000, []);
  const { publicKey } = useWallet();
  const connectWallet = useConnectWallet();
  const { bond } = useServerTx();
  const [amount, setAmount] = useState(5000);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; sig?: string } | null>(null);

  async function deposit() {
    if (!publicKey) return connectWallet();
    setBusy(true);
    setMsg(null);
    try {
      const { transaction, nav_per_unit } = await api.bondDepositTx(publicKey.toBase58(), amount);
      const sig = await bond(transaction);
      if (!role) setRole("investor");
      const units = nav_per_unit > 0 ? amount / nav_per_unit : amount;
      setMsg({ ok: true, text: `Deposited ${usd(amount)}: you now hold about ${units.toLocaleString("en-US", { maximumFractionDigits: 2 })} bond units at ${nav_per_unit.toFixed(4)} each.`, sig });
    } catch (e) {
      setMsg({ ok: false, text: friendlyError(e) });
    } finally {
      setBusy(false);
    }
  }

  const nav = pool?.onchain.nav_per_unit;
  const chips = [1000, 5000, 10000];
  return (
    <>
      <div className="hero pad-mid">
        <Contours />
        <section className="hero-body center">
          <span className="eyebrow">For investors</span>
          <h1 className="h1-page">Earn about 8% a year backing flood relief.</h1>
          <p>You only lose money in a rare, Harvey-size storm. The rest of the time your deposit earns T-bill interest plus a spread.</p>
        </section>
      </div>
      <div className="page">
        <section className="lift money-card">
          <div>
            <span>Expected return</span>
            <span className="big-num">~8%</span>
          </div>
          <div>
            <span>Expected loss a year</span>
            <span className="big-num">1.4%</span>
          </div>
          <div>
            <span>Value per unit</span>
            <span className="big-num" style={{ color: nav != null && nav < 1 ? "#B42318" : undefined }}>{nav == null ? "–" : nav.toFixed(4)}</span>
          </div>
        </section>

        <section className="stack">
          <div className="field">
            <label htmlFor="amt">How much to invest (test dollars)</label>
            <div className="payout-row">
              {chips.map((c) => (
                <button key={c} type="button" className={`btn ${amount === c ? "btn-primary" : "btn-outline"}`} onClick={() => setAmount(c)}>{usd(c)}</button>
              ))}
            </div>
            <div className="payout-row">
              <input id="amt" className="input" style={{ flex: "1 1 200px" }} type="number" min={1} value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
              <button className="btn btn-primary" onClick={deposit} disabled={busy || !(amount > 0)}>
                {busy ? "Confirm in your wallet…" : publicKey ? `Invest ${usd(amount)}` : "Connect wallet to invest"}
              </button>
            </div>
            <span className="hint">Devnet test money. Pooled figures are a simulation; only Houston is live.</span>
          </div>
          {msg && (
            <div className={`notice ${msg.ok ? "ok" : "bad"}`}>
              {msg.text}{" "}
              {msg.sig && <a href={explorer(msg.sig)} target="_blank" rel="noreferrer">View transaction</a>}
            </div>
          )}
        </section>

        <details className="stack">
          <summary className="section-title" style={{ fontSize: 18, cursor: "pointer" }}>How it works and the risks</summary>
          <div className="steps3" style={{ marginTop: 12 }}>
            <div className="lift">
              <h3>Where it sits</h3>
              <p>Premiums and community money pay first. The bond only pays out once they are used up, between <b>40%</b> and <b>90%</b> of total exposure.</p>
            </div>
            <div className="lift">
              <h3>What it pays</h3>
              <p>T-bill interest plus about <b>4 points</b>, roughly <b>8%</b> a year, set at three times the bond's expected loss.</p>
            </div>
            <div className="lift">
              <h3>What it risks</h3>
              <p>You lose some principal in about one year in nine, and in the model never all of it. Pooling about seven flood markets is what keeps this low.</p>
            </div>
          </div>
          <table className="terms" aria-label="Why pooling matters">
            <thead><tr><th></th><th>Houston alone</th><th>Seven markets pooled</th></tr></thead>
            <tbody>
              <tr><td>Expected loss per year</td><td>13.7%</td><td>1.4%</td></tr>
              <tr><td>Chance of any loss in a year</td><td>19%</td><td>11%</td></tr>
              <tr><td>Fair coupon</td><td>45%</td><td>8%</td></tr>
            </tbody>
          </table>
          <div className="notice info" style={{ fontSize: 14 }}>
            <b>What is real in this demo.</b> Only Houston is live, so the bond here sits directly behind Houston
            {harvey ? <> and a Harvey-sized storm would take about <b>{Math.round(harvey.investor_loss_pct)}%</b> of it.</> : "."}{" "}
            The pooled figures are a simulation: six more graded markets, assumed to flood independently, on 16 to 18 years of
            public data. The coupon is not paid out here, so value per unit only falls when a storm pays out.
            {pool && <> Bond capital held: <b>{usd(pool.onchain.bond_capital)}</b>.</>}
          </div>
          <p className="small muted" style={{ margin: 0 }}>
            Not looking for a return? <Link to="/readiness">Fund Houston's community fund</Link> instead. Live in Houston? <Link to="/protect">Get protected</Link>.
          </p>
        </details>
      </div>
    </>
  );
}
