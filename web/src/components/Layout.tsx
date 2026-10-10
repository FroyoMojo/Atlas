import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { NavLink, Outlet } from "react-router-dom";
import { api } from "../api";
import { config } from "../config";
import { usePoll } from "../usePoll";

export function Layout() {
  const { data: replay } = usePoll(api.replayStatus, 1000);
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
          {replay?.run_id && (
            <span className={`chip ${replay.running ? "live" : ""}`}>
              {replay.running ? "Replay running" : "Replay finished"}
              {replay.replay_time ? ` · ${new Date(replay.replay_time).toLocaleString()}` : ""}
            </span>
          )}
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
