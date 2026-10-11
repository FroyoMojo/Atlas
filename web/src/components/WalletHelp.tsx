// Shown when "Connect wallet" finds no Solana wallet in this browser (see useConnectWallet).
import { useEffect, useState } from "react";
import { NO_WALLET_EVENT } from "../wallet";

export function WalletHelp() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(NO_WALLET_EVENT, show);
    return () => window.removeEventListener(NO_WALLET_EVENT, show);
  }, []);
  if (!open) return null;
  return (
    <div className="sheet-backdrop" role="dialog" aria-modal="true" aria-labelledby="wallet-help-title" onClick={() => setOpen(false)}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2 id="wallet-help-title" className="section-title">No Solana wallet in this browser</h2>
        <ol style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8, fontSize: 15, lineHeight: 1.5, color: "#344054" }}>
          <li>
            Install <a href="https://phantom.app/download" target="_blank" rel="noreferrer">Phantom</a> for this browser, or open this
            site on your phone inside the Phantom app.
          </li>
          <li>In Phantom: Settings → Developer Settings → turn on <b>Testnet Mode</b>, network <b>Solana Devnet</b>.</li>
          <li>Refresh this page and press Connect wallet again.</li>
        </ol>
        <p className="small muted" style={{ margin: 0 }}>This demo uses test money on Solana devnet. Nothing here costs real money.</p>
        <button className="btn btn-primary" onClick={() => setOpen(false)}>Got it</button>
      </div>
    </div>
  );
}
