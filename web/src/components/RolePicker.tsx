import { useWallet } from "@solana/wallet-adapter-react";
import { short } from "../config";
import { ROLES, Role, useRole } from "../role";

/** Nav chip: the connected wallet and its role. Opens the chooser. */
export function RoleChip() {
  const { publicKey } = useWallet();
  const { role, choose } = useRole();
  if (!publicKey) return null;
  return (
    <button className="role-chip" onClick={() => choose(true)} aria-label="Change role">
      <span className="role-chip-role">{role ? ROLES[role].label : "Choose role"}</span>
      <span className="role-chip-wallet">{short(publicKey.toBase58())}</span>
    </button>
  );
}

/** "How are you using Atlas?" Shown to a connected wallet with no role, or when the chip is pressed. */
export function RoleChooser() {
  const { role, setRole, choosing, choose } = useRole();
  if (!choosing) return null;
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Choose your role" onClick={() => choose(false)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>How are you using Atlas?</h2>
        <p className="muted small">You can switch any time. This tailors the menu and gives you the right account page. It does not limit what you can do.</p>
        <div className="role-choices">
          {(Object.keys(ROLES) as Role[]).map((r) => (
            <button key={r} className={`role-choice ${role === r ? "on" : ""}`} onClick={() => setRole(r)}>
              <b>{ROLES[r].label}</b>
              <span>{ROLES[r].blurb}</span>
            </button>
          ))}
        </div>
        <button className="why-link" style={{ alignSelf: "center", fontSize: 14 }} onClick={() => choose(false)}>Not now</button>
      </div>
    </div>
  );
}
