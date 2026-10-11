import "./polyfills";
import "@solana/wallet-adapter-react-ui/styles.css";
import "leaflet/dist/leaflet.css";
import "./styles.css";

import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Layout } from "./components/Layout";
import { config } from "./config";
import { RoleProvider } from "./role";
import { AccountPage } from "./pages/AccountPage";
import { AdminPage } from "./pages/AdminPage";
import { CoverPage } from "./pages/CoverPage";
import { InvestPage } from "./pages/InvestPage";
import { MapPage } from "./pages/MapPage";
import { MyPage } from "./pages/MyPage";
import { ProofPage } from "./pages/ProofPage";
import { ReadinessPage } from "./pages/ReadinessPage";

// Old links (#/gauge/:id from Blinks and policy metadata) land on the new pages.
function GaugeRedirect() {
  return <Navigate to={`/protect/${encodeURIComponent(useParams().id ?? "")}`} replace />;
}

// Wallets normally register themselves through the Wallet Standard. Phantom's adapter is listed
// too, as a fallback for browsers where that registration doesn't reach the page; the provider
// drops it whenever Phantom's standard wallet is present, so it never shows twice.
const wallets = [new PhantomWalletAdapter()];

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConnectionProvider endpoint={config.rpcUrl}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <HashRouter>
            <ErrorBoundary>
            <RoleProvider>
            <Routes>
              <Route path="/phone" element={<MyPage standalone />} />
              <Route element={<Layout />}>
                <Route path="/" element={<MapPage />} />
                <Route path="/protect" element={<CoverPage />} />
                <Route path="/protect/:id" element={<CoverPage />} />
                <Route path="/gauge/:id" element={<GaugeRedirect />} />
                <Route path="/me" element={<MyPage />} />
                <Route path="/how" element={<Navigate to="/" replace />} />
                <Route path="/account" element={<AccountPage />} />
                <Route path="/proof" element={<ProofPage />} />
                <Route path="/readiness" element={<ReadinessPage />} />
                <Route path="/pool" element={<Navigate to="/proof" replace />} />
                <Route path="/verify" element={<ProofPage />} />
                <Route path="/invest" element={<InvestPage />} />
                <Route path="/admin" element={<AdminPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
            </RoleProvider>
            </ErrorBoundary>
          </HashRouter>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  </React.StrictMode>,
);
