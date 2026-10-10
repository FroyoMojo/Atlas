// Build the dashboard for hosting behind the gateway: same-origin API calls, real engine,
// aUSD mint from chain/state, purchase flow from .env. Writes web/.env.production.local.
//   npm run web:build
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { REPO_DIR, env, loadState } from "../env.js";

const vars = {
  VITE_USE_MOCKS: process.env.VITE_USE_MOCKS ?? "false",
  VITE_RPC_URL: env.rpcUrl,
  VITE_AUSD_MINT: loadState().ausdMint ?? "",
  VITE_EXPLORER_CLUSTER: /devnet/.test(env.rpcUrl) ? "devnet" : "custom",
  VITE_PURCHASE_FLOW: env.purchaseFlow,
};
if (!vars.VITE_AUSD_MINT) console.warn("No aUSD mint in chain/state yet; the phone view will show no balance.");
const web = resolve(REPO_DIR, "web");
writeFileSync(resolve(web, ".env.production.local"), Object.entries(vars).map(([k, v]) => `${k}=${v}`).join("\n") + "\n");
console.log(vars);
execSync("npm run build", { cwd: web, stdio: "inherit" });
