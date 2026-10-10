// Move a capped float from the Squads vault to the bot through a full 2-of-3 proposal.
//   npm run fund:bot -- [amountAUSD=2000]
import { getOrCreateAssociatedTokenAccount } from "@solana/spl-token";
import { connection, env, explorer, loadKeypair, requireState } from "../env.js";
import { toUnits } from "../lib/ausd.js";
import { vaultTransferAusd } from "../lib/squads.js";

const amount = Number(process.argv[2] ?? 2000);
const bot = loadKeypair("bot");
const ausdMint = requireState("ausdMint");
await getOrCreateAssociatedTokenAccount(connection, loadKeypair("treasury"), ausdMint, bot.publicKey);
const sig = await vaultTransferAusd({
  connection,
  multisigPda: requireState("multisig"),
  ausdMint,
  to: bot.publicKey,
  amountUnits: toUnits(amount),
  approvers: [loadKeypair("member1"), loadKeypair("member2")],
  timeLockSeconds: env.squadsTimeLockSeconds,
  log: console.log,
});
console.log(`moved ${amount} aUSD from vault to bot: ${explorer(sig)}`);
