// Log-in and account menu in the top bar. Logging in means choosing who to be in the demo (household,
// sponsor or investor), which opens that person's page. A wallet can be connected or an address pasted
// instead (view-only); both are checked against the demo's accepted wallets. Once in, the chip shows
// the person, and opens a panel to switch person or wallet, or log out.
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { short } from "../config";
import { ROLES, Role, useRole } from "../role";
import { useConnectWallet } from "../wallet";

const NOT_DEMO = "This demo only accepts the Atlas demo wallets. Use one of those to sign in.";

/** Top-bar button: "Log in" when nobody is, otherwise the person and wallet. */
export function RoleChip() {
  const { role, account, openPanel } = useRole();
  if (!account && !role) {
    return <button className="role-chip signin" onClick={() => openPanel("signin")}>Log in</button>;
  }
  return (
    <button className="role-chip" onClick={() => openPanel("account")} aria-label="Account menu">
      <span className="role-chip-role">{role ? ROLES[role].label : "Choose role"}</span>
      {account && <span className="role-chip-wallet">{short(account)}</span>}
    </button>
  );
}

export function AccountPanels() {
  const { role, setRole, viewAs, setViewAs, account, panel, openPanel } = useRole();
  const { publicKey, disconnect, select } = useWallet();
  const connectWallet = useConnectWallet();
  const navigate = useNavigate();
  const [address, setAddress] = useState("");
  const [ownWallet, setOwnWallet] = useState(false);
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
        setOwnWallet(true);
        openPanel("signin");
      })
      .catch(() => {
        /* the check is a courtesy: if it fails, the server still refuses actions for other wallets */
      });
  }, [publicKey, signOut, openPanel]);

  const close = () => {
    setError(null);
    setOwnWallet(false);
    openPanel(null);
  };

  /** Be this person: remember the choice and go to their page. */
  const pick = (r: Role) => {
    setRole(r);
    close();
    navigate(ROLES[r].home);
  };

  async function logOut() {
    await signOut();
    setRole(null);
    close();
    navigate("/");
  }

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
      close();
    } catch {
      setError("Couldn't check that wallet. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!panel) return null;

  const choices = (
    <div className="role-choices">
      {(Object.keys(ROLES) as Role[]).map((r) => (
        <button key={r} className={`role-choice ${role === r ? "on" : ""}`} onClick={() => pick(r)}>
          <b>{ROLES[r].label}</b>
          <span>{ROLES[r].blurb}</span>
        </button>
      ))}
    </div>
  );

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={panel === "signin" ? "Log in" : "Account"} onClick={close}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {panel === "signin" ? (
          <>
            <h2>Who do you want to be?</h2>
            <p className="muted small">Try the demo as any of them. Each opens the right page.</p>
            {choices}
            {!ownWallet ? (
              <button className="link-btn" onClick={() => setOwnWallet(true)}>Use my own wallet instead</button>
            ) : (
              <>
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
            )}
          </>
        ) : (
          <>
            <h2>{role ? ROLES[role].label : "Account"}</h2>
            <p className="muted small">
              {account
                ? `${short(account, 6)} · ${viewAs && !publicKey ? "view only" : "wallet connected"}`
                : "Looking around the demo. Connect a wallet to buy or invest on devnet."}
            </p>
            <p className="small" style={{ margin: 0 }}>Switch to:</p>
            {choices}
            <div style={{ display: "flex", gap: 10 }}>
              {!account && <button className="btn" style={{ flex: 1 }} onClick={() => (close(), connectWallet())}>Connect wallet</button>}
              <button className="btn" style={{ flex: 1 }} onClick={logOut}>Log out</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
