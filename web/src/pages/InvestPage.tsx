import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useState } from "react";
import { api } from "../api";
import { explorer } from "../config";
import { Contours, usd } from "../components/ui";
import { usePoll } from "../usePoll";
import { useReplay } from "../useReplay";
import { useServerTx } from "../wallet";

export function InvestPage() {
  const { runId } = useReplay();
  const { data: pool } = usePoll(() => api.pool(runId), 3000, [runId]);
  const { publicKey } = useWallet();
  const { setVisible } = useWalletModal();
  const { bond } = useServerTx();
  const [amount, setAmount] = useState(5000);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; sig?: string } | null>(null);

  async function deposit() {
    if (!publicKey) return setVisible(true);
    setBusy(true);
    setMsg(null);
    try {
      const { transaction, nav_per_unit } = await api.bondDepositTx(publicKey.toBase58(), amount);
      const sig = await bond(transaction);
      setMsg({ ok: true, text: `Deposited ${usd(amount)} at ${nav_per_unit.toFixed(4)} per unit.`, sig });
    } catch (e) {
      setMsg({ ok: false, text: String((e as Error).message ?? e) });
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
          <h1 style={{ fontSize: 46 }}>Earn the premiums. Carry the storm.</h1>
          <p>Bond capital sits behind the premium reserve. It earns the premiums and takes the loss in a storm like Harvey.</p>
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
        </section>
      </div>
    </>
  );
}
