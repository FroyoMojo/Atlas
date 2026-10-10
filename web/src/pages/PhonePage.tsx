// Large-type view of one wallet, mirrored next to the map on stage (plan 9.2).
// Open #/phone?owner=<address>, or connect the wallet on the phone itself.
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api";
import { config, short } from "../config";
import { usePoll } from "../usePoll";

export function PhonePage() {
  const [params] = useSearchParams();
  const { publicKey } = useWallet();
  const { connection } = useConnection();
  const owner = params.get("owner") ?? publicKey?.toBase58() ?? null;

  const { data: policies } = usePoll(() => (owner ? api.policies(owner) : Promise.resolve([])), 2000, [owner]);
  const { data: balance } = usePoll(async () => {
    if (!owner || !config.ausdMint) return null;
    const ata = getAssociatedTokenAddressSync(new PublicKey(config.ausdMint), new PublicKey(owner));
    try {
      return (await connection.getTokenAccountBalance(ata, "confirmed")).value.uiAmount ?? 0;
    } catch {
      return 0;
    }
  }, 2000, [owner]);

  // Flash "+N aUSD" when the balance goes up.
  const last = useRef<number | null>(null);
  const [flash, setFlash] = useState<number | null>(null);
  useEffect(() => {
    if (balance == null) return;
    if (last.current != null && balance > last.current) {
      setFlash(balance - last.current);
      setTimeout(() => setFlash(null), 6000);
    }
    last.current = balance;
  }, [balance]);

  if (!owner) return <div className="phone"><p>Open with ?owner=&lt;wallet address&gt; or connect a wallet.</p></div>;

  return (
    <div className="phone">
      <div className="phone-head">Atlas · {short(owner)}</div>
      <div className="phone-balance">{balance == null ? "–" : balance.toLocaleString(undefined, { maximumFractionDigits: 2 })}<span> aUSD</span></div>
      {flash && <div className="phone-flash">+{flash.toLocaleString()} aUSD paid</div>}
      <ul className="phone-policies">
        {policies?.map((p) => (
          <li key={p.policy_mint} className={p.status}>
            <div className="status">{p.status === "paid" ? "PAID" : p.status.toUpperCase()}</div>
            <div>Gauge {p.gauge_id}</div>
            <div className="small">Pays {p.payout} aUSD · policy {short(p.policy_mint)}</div>
          </li>
        ))}
        {policies && !policies.length && <li className="small">No policies yet.</li>}
      </ul>
    </div>
  );
}
