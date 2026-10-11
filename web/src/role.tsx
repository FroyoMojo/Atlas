// Who is using Atlas. The wallet is the account; a role (household, sponsor or investor) is a choice
// stored in this browser for that wallet. A visitor without a wallet extension can also "sign in" by
// pasting an address, which is view-only. The role tailors the menu and picks the account page. It is
// not access control: what a wallet may do is decided by the chain service (the demo allowlist).
import { useWallet } from "@solana/wallet-adapter-react";
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type Role = "household" | "sponsor" | "investor";

export const ROLES: Record<Role, { label: string; blurb: string; cta: { to: string; text: string } }> = {
  household: { label: "Household", blurb: "I live in a covered area and want a payment if my river floods.", cta: { to: "/protect", text: "Get protected" } },
  sponsor: { label: "Sponsor", blurb: "I want to fund a community's readiness. A gift: no return.", cta: { to: "/readiness", text: "Fund readiness" } },
  investor: { label: "Investor", blurb: "I want a return for carrying the remote flood risk.", cta: { to: "/invest", text: "Invest" } },
};

const isRole = (v: unknown): v is Role => v === "household" || v === "sponsor" || v === "investor";
const keyFor = (wallet: string | null) => `atlasRole:${wallet ?? "anon"}`;
const VIEW_KEY = "atlasViewAs";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null; // private window or blocked storage: the page works without remembering anything
  }
}
function write(key: string, value: string | null) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    /* not remembered, still applied for this visit */
  }
}
const readRole = (wallet: string | null): Role | null => {
  const v = read(keyFor(wallet));
  return isRole(v) ? v : null;
};

export type Panel = "signin" | "account" | null;

interface RoleState {
  role: Role | null;
  setRole: (r: Role | null) => void;
  /** An address pasted in at sign-in (view-only), when no wallet is connected. */
  viewAs: string | null;
  setViewAs: (a: string | null) => void;
  /** Connected wallet, else the pasted address. */
  account: string | null;
  /** Which panel is open: the sign-in or the account menu. */
  panel: Panel;
  openPanel: (p: Panel) => void;
}

const Ctx = createContext<RoleState>({
  role: null, setRole: () => {}, viewAs: null, setViewAs: () => {}, account: null, panel: null, openPanel: () => {},
});
export const useRole = () => useContext(Ctx);

export function RoleProvider({ children }: { children: ReactNode }) {
  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58() ?? null;
  const [viewAs, setViewAsState] = useState<string | null>(() => read(VIEW_KEY));
  const account = wallet ?? viewAs;
  const [role, setRoleState] = useState<Role | null>(() => readRole(account));
  const [panel, openPanel] = useState<Panel>(null);

  // A different account is a different person: load its role. A role picked before signing in (a card
  // on the map) carries over to the account that signs in.
  useEffect(() => {
    const r = readRole(account) ?? (account ? readRole(null) : null);
    setRoleState(r);
    if (account && r) write(keyFor(account), r);
  }, [account]);

  const setRole = useCallback(
    (r: Role | null) => {
      setRoleState(r);
      write(keyFor(account), r);
      openPanel(null);
    },
    [account],
  );

  const setViewAs = useCallback((a: string | null) => {
    setViewAsState(a);
    write(VIEW_KEY, a);
  }, []);

  const value = useMemo(
    () => ({ role, setRole, viewAs, setViewAs, account, panel, openPanel }),
    [role, setRole, viewAs, setViewAs, account, panel],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
