// Create the aUSD mint (classic SPL Token, 6 decimals) and mint 1,000,000 to the treasury.
import { createMint, getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import { connection, explorer, loadKeypair, loadState, saveState } from "../env.js";
import { AUSD_DECIMALS, AUSD_PROGRAM_ID, toUnits } from "../lib/ausd.js";

const treasury = loadKeypair("treasury");
if (loadState().ausdMint) {
  console.log(`aUSD already exists: ${loadState().ausdMint}`);
  process.exit(0);
}
const mint = await createMint(connection, treasury, treasury.publicKey, null, AUSD_DECIMALS, undefined, undefined, AUSD_PROGRAM_ID);
const ata = await getOrCreateAssociatedTokenAccount(connection, treasury, mint, treasury.publicKey);
await mintTo(connection, treasury, mint, ata.address, treasury, toUnits(1_000_000));
saveState({ ausdMint: mint.toBase58() });
console.log(`aUSD mint ${mint.toBase58()}  ${explorer(mint.toBase58(), "address")}`);
console.log("Minted 1,000,000 aUSD to the treasury. Put AUSD_MINT in .env for the web app.");
process.exit(0); // web3 confirmation websockets keep the event loop alive on provider RPCs
