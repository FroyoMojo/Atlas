import { useEffect } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useRole } from "../role";
import { ErrorBoundary } from "./ErrorBoundary";
import { AccountPanels, RoleChip } from "./RolePicker";
import { Brand } from "./ui";
import { WalletHelp } from "./WalletHelp";

// What each role sees in the menu; with no one logged in there is no menu, only the landing page.
const NAV: Record<string, { to: string; label: string }[]> = {
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
  return (
    <div className="app">
      <header className="nav">
        <div className="nav-inner">
          <div className="nav-left">
            <Brand />
            {role && (
              <nav className="nav-links" aria-label="Main">
                {NAV[role].map((l) => <NavLink key={l.to + l.label} to={l.to}>{l.label}</NavLink>)}
              </nav>
            )}
          </div>
          <div className="nav-right">
            <span className="chip-mock">Harvey Flood</span>
            <RoleChip />
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
      <footer className="footer">
        Demo on Solana devnet with test dollars. A fixed emergency payment, not property insurance.
        <span className="footer-links"><Link to="/proof">Proof</Link></span>
      </footer>
    </div>
  );
}
