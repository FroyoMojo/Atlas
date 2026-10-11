// Send SOL (for fees) and aUSD from the treasury to every demo wallet.
// Extra addresses (e.g. your Phantom phone wallet) can be passed as arguments.
import { getOrCreateAssociatedTokenAccount, transferChecked } from "@solana/spl-token";
import { LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";
import { KeyName, connection, loadKeypair, requireState } from "../env.js";
import { AUSD_DECIMALS, toUnits } from "../lib/ausd.js";
import { sendIxs } from "../lib/tx.js";

const treasury = loadKeypair("treasury");
const ausdMint = requireState("ausdMint");

const plan: { name: string; to: PublicKey; sol: number; ausd: number }[] = [
  ...(["issuer", "bot", "member1", "member2", "member3"] as KeyName[]).map((n) => ({
    name: n, to: loadKeypair(n).publicKey, sol: n === "issuer" ? 0.5 : 0.1, ausd: 0,
  })),
  ...(["holder1", "holder2", "holder3"] as KeyName[]).map((n) => ({ name: n, to: loadKeypair(n).publicKey, sol: 0.05, ausd: 1_000 })),
  { name: "investor", to: loadKeypair("investor").publicKey, sol: 0.05, ausd: 20_000 },
  ...process.argv.slice(2).map((a) => ({ name: "extra", to: new PublicKey(a), sol: 0.05, ausd: 1_000 })),
];

for (const p of plan) {
  const have = await connection.getBalance(p.to);
  if (have < p.sol * LAMPORTS_PER_SOL * 0.5) {
    await sendIxs(connection, [SystemProgram.transfer({ fromPubkey: treasury.publicKey, toPubkey: p.to, lamports: Math.round(p.sol * LAMPORTS_PER_SOL) })], [treasury]);
  }
  if (p.ausd > 0) {
    const from = await getOrCreateAssociatedTokenAccount(connection, treasury, ausdMint, treasury.publicKey);
    const to = await getOrCreateAssociatedTokenAccount(connection, treasury, ausdMint, p.to);
    if (to.amount < toUnits(p.ausd)) {
      await transferChecked(connection, treasury, from.address, ausdMint, to.address, treasury, toUnits(p.ausd) - to.amount, AUSD_DECIMALS);
    }
  }
  console.log(`${p.name.padEnd(9)} ${p.to.toBase58()}  SOL ${p.sol}  aUSD ${p.ausd}`);
}
process.exit(0); // web3 confirmation websockets keep the event loop alive on provider RPCs
