// Airdrop devnet SOL to the treasury, which then funds every other wallet (fund-wallets).
// The public faucet is rate-limited; if this fails, use https://faucet.solana.com for the
// treasury address printed below.
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { connection, loadKeypair } from "../env.js";

const treasury = loadKeypair("treasury").publicKey;
const want = Number(process.argv[2] ?? 2);
console.log(`treasury ${treasury.toBase58()}`);
for (let i = 0; i < 3; i++) {
  try {
    const sig = await connection.requestAirdrop(treasury, want * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig, "confirmed");
    break;
  } catch (err) {
    console.warn(`airdrop attempt ${i + 1} failed: ${String(err).slice(0, 160)}`);
    await new Promise((r) => setTimeout(r, 3_000 * (i + 1)));
  }
}
const sol = (await connection.getBalance(treasury)) / LAMPORTS_PER_SOL;
console.log(`treasury balance: ${sol} SOL`);
if (sol === 0) console.log("Faucet refused. Fund the treasury at https://faucet.solana.com and continue.");
process.exit(0); // web3 confirmation websockets keep the event loop alive on provider RPCs
