import { useEffect } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { config } from "../config";
import { ROLES, useRole } from "../role";
import { ErrorBoundary } from "./ErrorBoundary";
import { AccountPanels, RoleChip } from "./RolePicker";
import { Brand } from "./ui";
import { WalletHelp } from "./WalletHelp";

// What each role sees in the menu. Everyone keeps Map, Proof and How it works; without a role (not
// connected, or "Not now") the full set is shown.
const NAV: Record<string, { to: string; label: string }[]> = {
  none: [{ to: "/me", label: "My protection" }, { to: "/readiness", label: "Markets" }, { to: "/invest", label: "Invest" }],
  household: [{ to: "/me", label: "My protection" }],
  sponsor: [{ to: "/readiness", label: "Markets" }, { to: "/account", label: "My donations" }],
  investor: [{ to: "/invest", label: "Invest" }, { to: "/account", label: "My bond" }],
};

export function Layout() {
  const { pathname } = useLocation();
  const { role } = useRole();
  // A new page starts at the top. Braces matter: returning scrollTo's result makes React treat it as a
  // cleanup function and crash on the next page change.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  const cta = role ? ROLES[role].cta : ROLES.household.cta;
  return (
    <div className="app">
      <header className="nav">
        <div className="nav-inner">
          <div className="nav-left">
            <Brand />
            <nav className="nav-links" aria-label="Main">
              <NavLink to="/" end>Map</NavLink>
              {NAV[role ?? "none"].map((l) => <NavLink key={l.to + l.label} to={l.to}>{l.label}</NavLink>)}
              <NavLink to="/proof">Proof</NavLink>
              <NavLink to="/how">How it works</NavLink>
            </nav>
          </div>
          <div className="nav-right">
            {config.useMocks && <span className="chip-mock">mock data</span>}
            <RoleChip />
            <Link to={cta.to} className="btn btn-white">{cta.text}</Link>
          </div>
        </div>
      </header>
      <main>
        <ErrorBoundary resetKey={pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>
      <AccountPanels />
      <WalletHelp />
      <footer className="footer">Demo on Solana devnet with test dollars. A fixed emergency payment, not property insurance.</footer>
    </div>
  );
}
