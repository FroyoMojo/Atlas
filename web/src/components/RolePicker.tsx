// Sign-in and account menu in the top bar. "Sign in" connects a wallet or takes a pasted address
// (view-only); both are checked against the demo's accepted wallets. Once in, the chip shows the
// account and its role, and opens a panel to change role, switch wallet or sign out.
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import { short } from "../config";
import { ROLES, Role, useRole } from "../role";
import { useConnectWallet } from "../wallet";

const NOT_DEMO = "This demo only accepts the Atlas demo wallets. Use one of those to sign in.";

/** Top-bar button: "Sign in" when nobody is, otherwise the role and wallet. */
export function RoleChip() {
  const { role, account, openPanel } = useRole();
  if (!account) {
    return <button className="role-chip signin" onClick={() => openPanel("signin")}>Sign in</button>;
  }
  return (
    <button className="role-chip" onClick={() => openPanel("account")} aria-label="Account menu">
      <span className="role-chip-role">{role ? ROLES[role].label : "Choose role"}</span>
      <span className="role-chip-wallet">{short(account)}</span>
    </button>
  );
}

export function AccountPanels() {
  const { role, setRole, viewAs, setViewAs, account, panel, openPanel } = useRole();
  const { publicKey, disconnect, select } = useWallet();
  const connectWallet = useConnectWallet();
  const [address, setAddress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const checked = useRef<string | null>(null);

  const signOut = useCallback(async () => {
    setViewAs(null);
    try {
      await disconnect();
    } catch {
      /* already disconnected */
    }
    select(null); // forget the wallet so a reload does not sign straight back in
  }, [disconnect, select, setViewAs]);

  // A wallet that connects is checked against the demo list; one that isn't on it is signed out again.
  useEffect(() => {
    const w = publicKey?.toBase58() ?? null;
    if (!w || checked.current === w) return;
    checked.current = w;
    api.demoAllowed(w)
      .then(async (r) => {
        if (r.allowed) return;
        await signOut();
        checked.current = null;
        setError(NOT_DEMO);
        openPanel("signin");
      })
      .catch(() => {
        /* the check is a courtesy: if it fails, the server still refuses actions for other wallets */
      });
  }, [publicKey, signOut, openPanel]);

  async function continueWithAddress() {
    setError(null);
    let key: PublicKey;
    try {
      key = new PublicKey(address.trim());
    } catch {
      return setError("That doesn't look like a wallet address.");
    }
    setBusy(true);
    try {
      const { allowed } = await api.demoAllowed(key.toBase58());
      if (!allowed) return setError(NOT_DEMO);
      setViewAs(key.toBase58());
      setAddress("");
      openPanel(null);
    } catch {
      setError("Couldn't check that wallet. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!panel) return null;
  const close = () => {
    setError(null);
    openPanel(null);
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={panel === "signin" ? "Sign in" : "Account"} onClick={close}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {panel === "signin" ? (
          <>
            <h2>Sign in to Atlas</h2>
            <p className="muted small">Connect a wallet, or paste a wallet address to look around. This demo accepts the Atlas demo wallets.</p>
            <button className="btn btn-primary" onClick={() => (close(), connectWallet())}>Connect wallet</button>
            <div className="or-line"><span>or</span></div>
            <div className="field">
              <label htmlFor="addr-in">Wallet address</label>
              <input id="addr-in" className="input" placeholder="Paste a wallet address" value={address}
                onChange={(e) => setAddress(e.target.value)} onKeyDown={(e) => e.key === "Enter" && continueWithAddress()} autoComplete="off" spellCheck={false} />
              <span className="hint">View only: you can see an account but can't sign anything without the wallet.</span>
            </div>
            {error && <div className="notice bad">{error}</div>}
            <button className="btn" onClick={continueWithAddress} disabled={busy || address.trim().length < 32}>{busy ? "Checking…" : "Continue"}</button>
          </>
        ) : (
          <>
            <h2>{account ? short(account, 6) : "Account"}</h2>
            <p className="muted small">{viewAs && !publicKey ? "Signed in by address: view only." : "Signed in with your wallet."} Choose how you're using Atlas:</p>
            <div className="role-choices">
              {(Object.keys(ROLES) as Role[]).map((r) => (
                <button key={r} className={`role-choice ${role === r ? "on" : ""}`} onClick={() => setRole(r)}>
                  <b>{ROLES[r].label}</b>
                  <span>{ROLES[r].blurb}</span>
                </button>
              ))}
            </div>
            <p className="small muted" style={{ margin: 0 }}>The role tailors the menu and your account page. It doesn't limit what you can do.</p>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn" style={{ flex: 1 }} onClick={async () => { await signOut(); setError(null); openPanel("signin"); }}>Switch wallet</button>
              <button className="btn" style={{ flex: 1 }} onClick={async () => { await signOut(); close(); }}>Sign out</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
