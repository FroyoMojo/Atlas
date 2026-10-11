// Who is using Atlas: a household, a sponsor or an investor. The wallet is the account; the role is a
// choice stored in this browser for that wallet. It tailors the navigation and gives each role its own
// account page. It is not access control: what a wallet may do is still decided by the chain service.
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

function read(wallet: string | null): Role | null {
  try {
    const v = localStorage.getItem(keyFor(wallet));
    return isRole(v) ? v : null;
  } catch {
    return null; // private window or blocked storage: the page works without a remembered role
  }
}

interface RoleState {
  role: Role | null;
  setRole: (r: Role | null) => void;
  /** The role chooser is open. */
  choosing: boolean;
  choose: (open: boolean) => void;
}

const Ctx = createContext<RoleState>({ role: null, setRole: () => {}, choosing: false, choose: () => {} });
export const useRole = () => useContext(Ctx);

export function RoleProvider({ children }: { children: ReactNode }) {
  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58() ?? null;
  const [role, setRoleState] = useState<Role | null>(() => read(wallet));
  const [choosing, choose] = useState(false); // opened only by the menu chip

  // A different wallet is a different account: load its role. A role picked before connecting (a card
  // on the map) carries over to the wallet that connects. Nothing pops up: the chip in the menu changes
  // it, and doing something (buy, donate, invest) sets it when it is not set yet.
  useEffect(() => {
    const r = read(wallet) ?? (wallet ? read(null) : null);
    setRoleState(r);
    if (wallet && r) {
      try {
        localStorage.setItem(keyFor(wallet), r);
      } catch {
        /* not remembered */
      }
    }
  }, [wallet]);

  const setRole = useCallback(
    (r: Role | null) => {
      setRoleState(r);
      try {
        if (r) localStorage.setItem(keyFor(wallet), r);
        else localStorage.removeItem(keyFor(wallet));
      } catch {
        /* not remembered, still applied for this visit */
      }
      choose(false);
    },
    [wallet],
  );

  const value = useMemo(() => ({ role, setRole, choosing, choose }), [role, setRole, choosing]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
