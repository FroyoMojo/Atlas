// Create the catastrophe bond mint (classic SPL, 6 decimals, issuer is mint authority).
import { createMint } from "@solana/spl-token";
import { connection, explorer, loadKeypair, loadState, saveState } from "../env.js";
import { BOND_DECIMALS } from "../lib/bond.js";

if (loadState().bondMint) {
  console.log(`bond mint already exists: ${loadState().bondMint}`);
  process.exit(0);
}
const issuer = loadKeypair("issuer");
const mint = await createMint(connection, issuer, issuer.publicKey, null, BOND_DECIMALS);
saveState({ bondMint: mint.toBase58() });
console.log(`bond mint ${mint.toBase58()}  ${explorer(mint.toBase58(), "address")}`);
process.exit(0); // web3 confirmation websockets keep the event loop alive on provider RPCs
