import { useEffect } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { config } from "../config";
import { Brand } from "./ui";
import { WalletHelp } from "./WalletHelp";

export function Layout() {
  const { pathname } = useLocation();
  useEffect(() => window.scrollTo(0, 0), [pathname]); // a new page starts at the top
  return (
    <div className="app">
      <header className="nav">
        <div className="nav-inner">
          <div className="nav-left">
            <Brand />
            <nav className="nav-links" aria-label="Main">
              <NavLink to="/" end>Map</NavLink>
              <NavLink to="/me">My protection</NavLink>
              <NavLink to="/readiness">Markets</NavLink>
              <NavLink to="/invest">Invest</NavLink>
              <NavLink to="/proof">Proof</NavLink>
              <NavLink to="/how">How it works</NavLink>
            </nav>
          </div>
          <div className="nav-right">
            {config.useMocks && <span className="chip-mock">mock data</span>}
            <Link to="/protect" className="btn btn-white">Get protected</Link>
          </div>
        </div>
      </header>
      <main>
        <Outlet />
      </main>
      <WalletHelp />
      <footer className="footer">Demo on Solana devnet with test dollars. A fixed emergency payment, not property insurance.</footer>
    </div>
  );
}
