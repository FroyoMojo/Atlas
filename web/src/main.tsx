import "./polyfills";
import "@solana/wallet-adapter-react-ui/styles.css";
import "leaflet/dist/leaflet.css";
import "./styles.css";

import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { config } from "./config";
import { GaugePage } from "./pages/GaugePage";
import { MapPage } from "./pages/MapPage";
import { PhonePage } from "./pages/PhonePage";
import { PoolPage } from "./pages/PoolPage";
import { VerifyPage } from "./pages/VerifyPage";

// Phantom and Solflare register themselves through the Wallet Standard, so no adapters are listed.
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConnectionProvider endpoint={config.rpcUrl}>
      <WalletProvider wallets={[]} autoConnect>
        <WalletModalProvider>
          <HashRouter>
            <Routes>
              <Route path="/phone" element={<PhonePage />} />
              <Route element={<Layout />}>
                <Route path="/" element={<MapPage />} />
                <Route path="/gauge/:id" element={<GaugePage />} />
                <Route path="/pool" element={<PoolPage />} />
                <Route path="/verify" element={<VerifyPage />} />
              </Route>
            </Routes>
          </HashRouter>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  </React.StrictMode>,
);
