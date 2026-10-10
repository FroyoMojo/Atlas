// The money moment (plan v3 9.2): one wallet in large type, mirrored on the projector.
// Balance is read straight from chain; the banner appears when a payout confirms.
// Open #/phone?owner=<address>, or connect the wallet on the phone itself.
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api";
import { config, explorer, short } from "../config";
import type { Policy } from "../types";
import { usePoll } from "../usePoll";

export function PhonePage() {
  const [params] = useSearchParams();
  const { publicKey } = useWallet();
  const { connection } = useConnection();
  const owner = params.get("owner") ?? publicKey?.toBase58() ?? null;

  const { data: policies } = usePoll(() => (owner ? api.policies(owner) : Promise.resolve([] as Policy[])), 1500, [owner]);
  const { data: balance } = usePoll(
    async () => {
      if (!owner || !config.ausdMint) return null;
      const ata = getAssociatedTokenAddressSync(new PublicKey(config.ausdMint), new PublicKey(owner));
      try {
        return (await connection.getTokenAccountBalance(ata, "confirmed")).value.uiAmount ?? 0;
      } catch {
        return 0;
      }
    },
    1500,
    [owner],
  );

  // Banner when a new payout confirms: "+$500 • PAID • Brays Bayou".
  const seen = useRef<Set<string> | null>(null);
  const [banner, setBanner] = useState<{ amount: number; place: string; kind: string; sig: string } | null>(null);
  useEffect(() => {
    if (!policies) return;
    const sigs = policies.filter((p) => p.last_payout).map((p) => p.last_payout!.tx_sig);
    if (seen.current === null) {
      seen.current = new Set(sigs); // don't banner payouts that happened before the page opened
      return;
    }
    for (const p of policies) {
      const lp = p.last_payout;
      if (lp && !seen.current.has(lp.tx_sig)) {
        seen.current.add(lp.tx_sig);
        setBanner({ amount: lp.amount, place: p.gauge_name ?? p.gauge_id, kind: lp.kind, sig: lp.tx_sig });
      }
    }
  }, [policies]);

  if (!owner) {
    return (
      <div className="phone">
        <p>Open with ?owner=&lt;wallet address&gt; or connect a wallet.</p>
      </div>
    );
  }

  return (
    <div className="phone">
      <div className="phone-head">Atlas · {short(owner)}</div>
      <div className="phone-balance">
        {balance == null ? "–" : balance.toLocaleString(undefined, { maximumFractionDigits: 2 })}
        <span> aUSD</span>
      </div>
      {banner && (
        <a className="phone-flash" href={explorer(banner.sig)} target="_blank" rel="noreferrer">
          +${banner.amount.toLocaleString()} • {banner.kind === "trueup" ? "TRUE-UP" : "PAID"} • {banner.place}
        </a>
      )}
      <ul className="phone-policies">
        {policies?.map((p) => (
          <li key={p.policy_mint} className={p.status.toLowerCase()}>
            <div className="status">{p.status === "ACTV" ? "ACTIVE" : p.status === "PAID" ? "PAID" : "EXPIRED"}</div>
            <div>{p.gauge_name ?? p.gauge_id}</div>
            <div className="small">
              Pays {p.payout} aUSD · paid so far {p.paid_amount} · policy {short(p.policy_mint)}
            </div>
          </li>
        ))}
        {policies && !policies.length && <li className="small">No policies yet.</li>}
      </ul>
    </div>
  );
}
