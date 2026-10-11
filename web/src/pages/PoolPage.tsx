import { useWallet } from "@solana/wallet-adapter-react";
import { useState } from "react";
import { api } from "../api";
import { explorer, short } from "../config";
import { usePoll } from "../usePoll";
import { useServerTx } from "../wallet";

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });

export function PoolPage() {
  const { data: replay } = usePoll(api.replayStatus, 1000);
  const runId = replay?.run_id ?? null;
  const { data: pool, error } = usePoll(() => api.pool(runId), 1500, [runId]);
  const { data: harvey } = usePoll(() => api.stress("harvey"), 30_000);
  const { data: storms } = usePoll(() => api.storms(runId), 1500, [runId]);
  const payouts = storms?.flatMap((s) => s.payouts.map((p) => ({ ...p, storm: s.storm_id }))) ?? [];

  const { publicKey } = useWallet();
  const { bond } = useServerTx();
  const [amount, setAmount] = useState(5000);
  const [msg, setMsg] = useState<string | null>(null);

  async function deposit() {
    if (!publicKey) return setMsg("Connect a wallet first.");
    try {
      const { transaction, nav_per_unit } = await api.bondDepositTx(publicKey.toBase58(), amount);
      const sig = await bond(transaction);
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
          <div className="row">
            <h3 className="grow">On-chain (devnet)</h3>
            {pool && <span className={`chip ${pool.onchain.reconciled ? "good" : "live"}`}>{pool.onchain.reconciled ? "Reconciled" : "Not reconciled"}</span>}
          </div>
          <p className="muted small">Real vault, float and token balances, from the ledger for this run.</p>
          {pool && (
            <dl className="stats">
              <dt>Seeded capital (not premiums)</dt><dd>{fmt(pool.onchain.seeded_capital)} aUSD</dd>
              <dt>Premiums in</dt><dd>{fmt(pool.onchain.premiums_in)} aUSD</dd>
              <dt>Reserve</dt><dd>{fmt(pool.onchain.reserve)} aUSD</dd>
              <dt>Bond capital</dt><dd>{fmt(pool.onchain.bond_capital)} aUSD</dd>
              <dt>Payout float</dt><dd>{fmt(pool.onchain.float)} aUSD</dd>
              <dt>Bond NAV per unit</dt><dd className={pool.onchain.nav_per_unit < 1 ? "down" : ""}>{pool.onchain.nav_per_unit.toFixed(4)}</dd>
              <dt>Payouts out</dt><dd>{fmt(pool.onchain.payouts_out)} aUSD</dd>
            </dl>
          )}
        </div>
        <div className="card">
          <h3>Simulated book</h3>
          <p className="muted small">A simulated 2,000-policy portfolio for catastrophe numbers. Not real sales.</p>
          {pool && (
            <dl className="stats">
              <dt>Policies</dt><dd>{fmt(pool.simulated.policies)}</dd>
              <dt>Worst observed year loss</dt><dd>${fmt(pool.simulated.worst_year_loss)}</dd>
              <dt>Harvey loss (this run)</dt><dd>${fmt(pool.simulated.harvey_loss)}</dd>
              <dt>Reserve used</dt><dd>${fmt(pool.simulated.reserve_used)}</dd>
              <dt>Bond used</dt><dd>${fmt(pool.simulated.bond_used)}</dd>
              <dt>Interim share f_int</dt><dd>{pool.simulated.f_int.toFixed(2)}</dd>
              <dt>Final share f_fin</dt><dd>{pool.simulated.f_fin.toFixed(2)}</dd>
              <dt>Investor loss</dt><dd>{pool.simulated.investor_loss_pct}%</dd>
            </dl>
          )}
          {harvey && (
            <p className="muted small">
              Full Harvey stress test: ${fmt(harvey.aggregate_loss)} loss, final share {harvey.f_fin.toFixed(2)}, bond investors lose{" "}
              {harvey.investor_loss_pct}%.
            </p>
          )}
        </div>
      </div>

      <div className="card">
        <h3>Payouts</h3>
        {!payouts.length && <p className="muted">No payouts yet.</p>}
        <table className="table">
          <thead>
            <tr><th>Storm</th><th>Policy</th><th>Kind</th><th>Amount</th><th>Transaction</th></tr>
          </thead>
          <tbody>
            {payouts.map((p) => (
              <tr key={p.tx_sig}>
                <td>{p.storm}</td>
                <td>{short(p.policy)}</td>
                <td>{p.kind === "trueup" ? "true-up" : "interim"}</td>
                <td>{p.amount} aUSD</td>
                <td><a href={explorer(p.tx_sig)} target="_blank" rel="noreferrer">{short(p.tx_sig, 6)}</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>Invest in the catastrophe bond</h3>
        <p className="muted small">Coupons from premiums accrue into NAV; the bond absorbs losses after the reserve. Units are issued at NAV.</p>
        <div className="row">
          <input type="number" value={amount} min={1} onChange={(e) => setAmount(Number(e.target.value))} />
          <button className="primary" onClick={deposit}>Deposit aUSD</button>
        </div>
        {msg && <p className="small">{msg}</p>}
      </div>
    </div>
  );
}
