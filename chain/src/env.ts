// Shared config: .env from the repo root, the devnet connection, keypairs and saved addresses.
import { config } from "dotenv";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const CHAIN_DIR = resolve(here, "..");
export const REPO_DIR = resolve(CHAIN_DIR, "..");

config({ path: resolve(REPO_DIR, ".env"), quiet: true });

export const env = {
  rpcUrl: process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com",
  secretsDir: resolve(REPO_DIR, process.env.SECRETS_DIR ?? "secrets"),
  stateFile: resolve(REPO_DIR, process.env.CHAIN_STATE_FILE ?? "chain/state/devnet.json"),
  databaseUrl: process.env.DATABASE_URL,
  engineUrl: process.env.ENGINE_URL ?? "http://localhost:8000",
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? "http://localhost:8787",
  port: Number(process.env.CHAIN_PORT ?? 8787),
  // Localhost by default: the gateway (behind Cloudflare Tunnel) is the only public entry point.
  host: process.env.CHAIN_HOST ?? "127.0.0.1",
  demoMode: (process.env.DEMO_MODE ?? "true") === "true",
  // Plan v3 9.3: required on /chain/reset (and on the engine's /replay/* routes).
  adminToken: process.env.ADMIN_TOKEN ?? "",
  // Plan v3 6.6: balances reset refills to before each run.
  snapshotVault: Number(process.env.SNAPSHOT_VAULT ?? 5_300),
  snapshotFloat: Number(process.env.SNAPSHOT_FLOAT ?? 2_000),
  // Plan v3 9.3: in demo mode, buy and bond accept only these wallets (comma-separated).
  demoWallets: (process.env.DEMO_WALLETS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  // Plan v3 8.3: "a" = server signs first (default), "b" = wallet signs first, server co-signs.
  purchaseFlow: (process.env.PURCHASE_FLOW ?? "a").toLowerCase() === "b" ? "b" : "a",
  priorityMicroLamports: Number(process.env.PRIORITY_MICROLAMPORTS ?? 10_000),
  squadsTimeLockSeconds: Number(process.env.SQUADS_TIMELOCK_SECONDS ?? 60),
  // Used when the engine's /quote is unreachable (demo mode only).
  fallbackPremium: Number(process.env.FALLBACK_PREMIUM ?? 48),
  defaultPayout: Number(process.env.DEFAULT_PAYOUT ?? 500),
  botPollMs: Number(process.env.BOT_POLL_MS ?? 2_000),
};

export const connection = new Connection(env.rpcUrl, "confirmed");

// Every keypair the scripts know about. Files live in SECRETS_DIR (git-ignored).
export const KEY_NAMES = [
  "treasury", // mints aUSD, pays rent for setup
  "issuer", // policy + bond mint authority, metadata update authority, permanent delegate
  "bot", // payout bot hot wallet
  "member1", // multisig: Jesse
  "member2", // multisig: Ezekiel
  "member3", // multisig: stand-in independent trustee
  "holder1",
  "holder2",
  "holder3",
  "investor",
] as const;
export type KeyName = (typeof KEY_NAMES)[number];

export function keyPath(name: KeyName): string {
  return resolve(env.secretsDir, `${name}.json`);
}

export function loadKeypair(name: KeyName): Keypair {
  const path = keyPath(name);
  if (!existsSync(path)) {
    throw new Error(`Missing keypair ${path}. Run \`npm run keygen\` first.`);
  }
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, "utf8"))));
}

export function saveKeypair(name: KeyName, kp: Keypair): void {
  mkdirSync(env.secretsDir, { recursive: true });
  writeFileSync(keyPath(name), JSON.stringify(Array.from(kp.secretKey)), { mode: 0o600 });
}

// Public addresses created by the setup scripts. Safe to commit; contains no secrets.
export interface ChainState {
  ausdMint?: string;
  multisig?: string;
  multisigCreateKey?: string;
  vault?: string;
  bondMint?: string;
}

export function loadState(): ChainState {
  if (!existsSync(env.stateFile)) return {};
  return JSON.parse(readFileSync(env.stateFile, "utf8"));
}

export function saveState(patch: Partial<ChainState>): ChainState {
  const next = { ...loadState(), ...patch };
  mkdirSync(dirname(env.stateFile), { recursive: true });
  writeFileSync(env.stateFile, JSON.stringify(next, null, 2) + "\n");
  return next;
}

export function requireState<K extends keyof ChainState>(key: K): PublicKey {
  const value = loadState()[key];
  if (!value) throw new Error(`${key} not set in ${env.stateFile}. Run the matching setup script first.`);
  return new PublicKey(value);
}

export function explorer(sigOrAddress: string, kind: "tx" | "address" = "tx"): string {
  const cluster = /devnet/.test(env.rpcUrl)
    ? "cluster=devnet"
    : `cluster=custom&customUrl=${encodeURIComponent(env.rpcUrl)}`;
  return `https://explorer.solana.com/${kind}/${sigOrAddress}?${cluster}`;
}
