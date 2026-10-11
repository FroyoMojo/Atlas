import "./polyfills";
import "@solana/wallet-adapter-react-ui/styles.css";
import "leaflet/dist/leaflet.css";
import "./styles.css";

import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import { Layout } from "./components/Layout";
import { config } from "./config";
import { AdminPage } from "./pages/AdminPage";
import { CoverPage } from "./pages/CoverPage";
import { HowPage } from "./pages/HowPage";
import { InvestPage } from "./pages/InvestPage";
import { MapPage } from "./pages/MapPage";
import { MyPage } from "./pages/MyPage";
import { ProofPage } from "./pages/ProofPage";
import { ReadinessPage } from "./pages/ReadinessPage";

// Old links (#/gauge/:id from Blinks and policy metadata) land on the new pages.
function GaugeRedirect() {
  return <Navigate to={`/protect/${encodeURIComponent(useParams().id ?? "")}`} replace />;
}

// Phantom and Solflare register themselves through the Wallet Standard, so no adapters are listed.
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConnectionProvider endpoint={config.rpcUrl}>
      <WalletProvider wallets={[]} autoConnect>
        <WalletModalProvider>
          <HashRouter>
            <Routes>
              <Route path="/phone" element={<MyPage standalone />} />
              <Route element={<Layout />}>
                <Route path="/" element={<MapPage />} />
                <Route path="/protect" element={<CoverPage />} />
                <Route path="/protect/:id" element={<CoverPage />} />
                <Route path="/gauge/:id" element={<GaugeRedirect />} />
                <Route path="/me" element={<MyPage />} />
                <Route path="/proof" element={<ProofPage />} />
                <Route path="/readiness" element={<ReadinessPage />} />
                <Route path="/pool" element={<Navigate to="/proof" replace />} />
                <Route path="/verify" element={<ProofPage />} />
                <Route path="/invest" element={<InvestPage />} />
                <Route path="/how" element={<HowPage />} />
                <Route path="/admin" element={<AdminPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </HashRouter>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  </React.StrictMode>,
);
