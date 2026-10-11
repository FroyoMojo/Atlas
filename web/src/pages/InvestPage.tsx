import { useWallet } from "@solana/wallet-adapter-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { explorer } from "../config";
import { Contours, usd } from "../components/ui";
import { friendlyError } from "../errors";
import { usePoll } from "../usePoll";
import { useReplay } from "../useReplay";
import { useConnectWallet, useServerTx } from "../wallet";

export function InvestPage() {
  const { runId } = useReplay();
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
      const units = nav_per_unit > 0 ? amount / nav_per_unit : amount;
      setMsg({ ok: true, text: `Deposited ${usd(amount)}: you now hold about ${units.toLocaleString("en-US", { maximumFractionDigits: 2 })} bond units at ${nav_per_unit.toFixed(4)} each.`, sig });
    } catch (e) {
      setMsg({ ok: false, text: friendlyError(e) });
    } finally {
      setBusy(false);
    }
  }

  const nav = pool?.onchain.nav_per_unit;
  return (
    <>
      <div className="hero pad-mid">
        <Contours />
        <section className="hero-body center">
          <span className="eyebrow">For investors</span>
          <h1 style={{ fontSize: 46 }}>A catastrophe bond for floods.</h1>
          <p>Atlas bond holders take only the remote tail: the losses that come after premiums and community money are used up. In return they earn T-bill interest plus a spread sized to that risk.</p>
        </section>
      </div>
      <div className="page">
        <section className="lift money-card">
          <div>
            <span>Bond capital</span>
            <span className="big-num">{pool ? usd(pool.onchain.bond_capital) : "–"}</span>
          </div>
          <div>
            <span>Value per unit</span>
            <span className="big-num" style={{ color: nav != null && nav < 1 ? "#B42318" : undefined }}>{nav == null ? "–" : nav.toFixed(4)}</span>
          </div>
        </section>

        <section className="stack">
          <h2 className="section-title" style={{ fontSize: 22 }}>The bond's terms</h2>
          <div className="steps3" style={{ marginTop: 0 }}>
            <div className="lift">
              <h3>Where it sits</h3>
              <p>Premiums pay the expected losses. Community money (seed reserve, saved surplus, sponsor donations) pays the next layer. The bond attaches at <b>40%</b> of total exposure and is used up at <b>90%</b>. Households share anything above that equally.</p>
            </div>
            <div className="lift">
              <h3>What it pays</h3>
              <p>T-bill interest plus about <b>4 points</b>, roughly <b>8%</b> a year, paid in aUSD held as collateral. The spread is set at three times the bond's expected loss, the usual cat bond rule of thumb.</p>
            </div>
            <div className="lift">
              <h3>What it risks</h3>
              <p>An expected loss of <b>1.4%</b> a year. You lose some principal in about one year in nine, and in the model never all of it. That works because the bond pools about seven flood markets, not Houston alone.</p>
            </div>
          </div>
          <table className="terms" aria-label="Why pooling matters">
            <thead><tr><th></th><th>Houston alone</th><th>Seven markets pooled</th></tr></thead>
            <tbody>
              <tr><td>Expected loss per year</td><td>13.7%</td><td>1.4%</td></tr>
              <tr><td>Chance of any loss in a year</td><td>19%</td><td>11%</td></tr>
              <tr><td>Fair coupon (T-bills + 3x expected loss)</td><td>45%</td><td>8%</td></tr>
            </tbody>
          </table>
          <div className="notice info" style={{ fontSize: 14 }}>
            <b>What is real in this demo.</b> Only Houston is live, so the bond here sits directly behind Houston
            {harvey ? <> and a Harvey-sized storm would take about <b>{Math.round(harvey.investor_loss_pct)}%</b> of it.</> : "."}{" "}
            The pooled figures are a simulation: six more graded markets, assumed to flood independently, on 16 to 18 years of
            public data. Devnet test dollars; the coupon is not paid out here, so value per unit only falls when a storm pays out.
          </div>
        </section>

        <section className="stack">
          <div className="field">
            <label htmlFor="amt">Amount (test dollars)</label>
            <div className="payout-row">
              <input id="amt" className="input" style={{ flex: "1 1 200px" }} type="number" min={1} value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
              <button className="btn btn-primary" onClick={deposit} disabled={busy || !(amount > 0)}>
                {busy ? "Confirm in your wallet…" : publicKey ? "Deposit" : "Connect wallet"}
              </button>
            </div>
            <span className="hint">Units are issued at the current value per unit. Devnet test money.</span>
          </div>
          {msg && (
            <div className={`notice ${msg.ok ? "ok" : "bad"}`}>
              {msg.text}{" "}
              {msg.sig && <a href={explorer(msg.sig)} target="_blank" rel="noreferrer">View transaction</a>}
            </div>
          )}
          <p className="small muted" style={{ margin: 0 }}>
            Not looking for a return? <Link to="/readiness">Fund a neighborhood's readiness</Link> instead. Live in Houston? <Link to="/protect">Get protected</Link>.
          </p>
        </section>
      </div>
    </>
  );
}
