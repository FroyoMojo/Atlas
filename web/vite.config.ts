import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // @solana/web3.js v1 expects Node's `global`.
  define: { global: "globalThis" },
  server: { port: 5173, host: true },
});
