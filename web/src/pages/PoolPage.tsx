import { useWallet } from "@solana/wallet-adapter-react";
import { useState } from "react";
import { api } from "../api";
import { explorer, short } from "../config";
import { usePoll } from "../usePoll";
import { useSendServerTx } from "../wallet";

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });

export function PoolPage() {
  const { data: pool, error } = usePoll(api.pool, 1500);
  const { data: stress } = usePoll(api.stress, 30_000);
  const { data: events } = usePoll(() => api.events(null), 1500);
  const payouts = events?.flatMap((e) => e.payouts.map((p) => ({ ...p, gauge: e.gauge_id, factor: e.pay_factor }))) ?? [];

  const { publicKey } = useWallet();
  const sendServerTx = useSendServerTx();
  const [amount, setAmount] = useState(5000);
  const [msg, setMsg] = useState<string | null>(null);

  async function deposit() {
    if (!publicKey) return setMsg("Connect a wallet first.");
    try {
      const { transaction, nav_per_unit } = await api.bondDepositTx(publicKey.toBase58(), amount);
      const sig = await sendServerTx(transaction);
      setMsg(`Deposited ${amount} aUSD at NAV ${nav_per_unit}. ${explorer(sig)}`);
    } catch (e) {
      setMsg(String((e as Error).message ?? e));
    }
  }

  return (
    <div className="pool-page">
      {error && <p className="error">{error}</p>}
      <div className="grid-2">
        <div className="card">
          <h3>On-chain (devnet)</h3>
          <p className="muted small">Real vault and token balances.</p>
          {pool && (
            <dl className="stats">
              <dt>Premium reserve</dt><dd>{fmt(pool.onchain.reserve)} aUSD</dd>
              <dt>Bond capital</dt><dd>{fmt(pool.onchain.bond_capital)} aUSD</dd>
              <dt>Bond NAV per unit</dt><dd className={pool.onchain.nav_per_unit < 1 ? "down" : ""}>{pool.onchain.nav_per_unit.toFixed(4)}</dd>
              <dt>Premiums in</dt><dd>{fmt(pool.onchain.premiums_in)} aUSD</dd>
              <dt>Payouts out</dt><dd>{fmt(pool.onchain.payouts_out)} aUSD</dd>
            </dl>
          )}
        </div>
        <div className="card">
          <h3>Simulated book</h3>
          <p className="muted small">A simulated portfolio used for catastrophe numbers. Not real sales.</p>
          {pool && (
            <dl className="stats">
              <dt>Policies</dt><dd>{fmt(pool.simulated.policies)}</dd>
              <dt>Aggregate loss</dt><dd>${fmt(pool.simulated.aggregate_loss)}</dd>
              <dt>Reserve used</dt><dd>${fmt(pool.simulated.reserve_used)}</dd>
              <dt>Bond used</dt><dd>${fmt(pool.simulated.bond_used)}</dd>
              <dt>Pro-rata cut</dt><dd>{(pool.simulated.prorata_cut * 100).toFixed(0)}%</dd>
            </dl>
          )}
          {stress && (
            <p className="muted small">
              Full Harvey stress test: ${fmt(stress.aggregate_loss)} loss, bond investors lose {stress.investor_loss_pct}%.
            </p>
          )}
        </div>
      </div>

      <div className="card">
        <h3>Payouts</h3>
        {!payouts.length && <p className="muted">No payouts yet.</p>}
        <table className="table">
          <thead>
            <tr><th>Gauge</th><th>Holder</th><th>Amount</th><th>Pay factor</th><th>Transaction</th></tr>
          </thead>
          <tbody>
            {payouts.map((p) => (
              <tr key={p.tx_sig}>
                <td>{p.gauge}</td>
                <td>{short(p.owner)}</td>
                <td>{p.amount} aUSD</td>
                <td>{p.factor.toFixed(3)}</td>
                <td><a href={explorer(p.tx_sig)} target="_blank" rel="noreferrer">{short(p.tx_sig, 6)}</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>Invest in the catastrophe bond</h3>
        <p className="muted small">Earns the coupon from premiums; absorbs losses after the reserve. Units are issued at NAV.</p>
        <div className="row">
          <input type="number" value={amount} min={1} onChange={(e) => setAmount(Number(e.target.value))} />
          <button className="primary" onClick={deposit}>Deposit aUSD</button>
        </div>
        {msg && <p className="small">{msg}</p>}
      </div>
    </div>
  );
}
