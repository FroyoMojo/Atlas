// Create any missing keypairs in SECRETS_DIR (git-ignored). Never overwrites existing keys.
import { Keypair } from "@solana/web3.js";
import { existsSync } from "node:fs";
import { KEY_NAMES, keyPath, loadKeypair, saveKeypair } from "../env.js";

for (const name of KEY_NAMES) {
  const created = !existsSync(keyPath(name));
  if (created) saveKeypair(name, Keypair.generate());
  console.log(`${name.padEnd(9)} ${loadKeypair(name).publicKey.toBase58()}${created ? "  (new)" : ""}`);
}
console.log("\nmember1 = Jesse, member2 = Ezekiel, member3 = stand-in trustee.");
console.log("To use your own Phantom wallets as holders, skip holder1-3 and pass your address to fund-wallets.");
