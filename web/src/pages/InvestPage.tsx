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
          <h1 style={{ fontSize: 46 }}>Get paid to carry the storm.</h1>
          <p>Bond capital sits behind the premium reserve. In a normal year it earns its share of the premiums. In a storm like Harvey it pays households first and takes the loss.</p>
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
          <h2 className="section-title" style={{ fontSize: 22 }}>What you earn and what you risk</h2>
          <div className="steps3" style={{ marginTop: 0 }}>
            <div className="lift">
              <h3>The return</h3>
              <p>Every price Atlas quotes includes a charge of about 6% a year on the capital held for risk, set aside to pay bond holders. That is the return this bond is priced to pay.</p>
            </div>
            <div className="lift">
              <h3>The risk</h3>
              <p>
                {harvey
                  ? <>In a Harvey-sized storm our simulation has bond holders losing about <b>{Math.round(harvey.investor_loss_pct)}%</b> of their capital, after the premium reserve is used up. Households are paid in full first.</>
                  : "Loading the Harvey stress test…"}
              </p>
            </div>
            <div className="lift">
              <h3>The demo</h3>
              <p>This runs on devnet with test dollars. The coupon is part of the price but is not paid out here, so value per unit only moves down when a storm pays out. It does not rise.</p>
            </div>
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
