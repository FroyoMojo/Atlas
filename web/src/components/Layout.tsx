import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { NavLink, Outlet } from "react-router-dom";
import { getAdminToken } from "../admin";
import { api } from "../api";
import { config } from "../config";
import { usePoll } from "../usePoll";

export function Layout() {
  const { data: replay } = usePoll(api.replayStatus, 1000);
  const { data: storms } = usePoll(() => api.storms(replay?.run_id ?? null), 1500, [replay?.run_id]);
  const storm = storms?.at(-1);
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          Atlas <span>flood cover for Houston</span>
        </div>
        <nav>
          <NavLink to="/" end>Map</NavLink>
          <NavLink to="/pool">Pool</NavLink>
          <NavLink to="/verify">Verify</NavLink>
          <a href="#/phone" target="_blank" rel="noreferrer">Phone view</a>
        </nav>
        <div className="right">
          {config.useMocks && <span className="chip warn">mock data</span>}
          {getAdminToken() && <span className="chip">admin</span>}
          {replay?.run_id && (
            <span className={`chip ${replay.status === "running" ? "live" : ""}`}>
              {replay.status === "running" ? "Replay running" : `Replay ${replay.status}`}
              {replay.clock ? ` · ${new Date(replay.clock).toLocaleString()}` : ""}
            </span>
          )}
          {storm && <span className={`chip ${storm.status === "open" ? "live" : ""}`}>Storm {storm.status.replace("_", " ")}</span>}
          <WalletMultiButton />
        </div>
      </header>
      <main>
        <Outlet />
      </main>
      <footer>Devnet prototype with test money. Not a licensed insurance product.</footer>
    </div>
  );
}
