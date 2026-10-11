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

// Ledger: reserve -> float (plan v3 F2), if the database is configured.
if (env.databaseUrl) {
  const { currentRunId, closeDb } = await import("../db.js");
  const { writeLedgerEntry } = await import("../lib/ledger.js");
  await writeLedgerEntry({
    runId: await currentRunId(), // now: the proposal executed moments ago
    entryId: `float:${sig}`,
    memo: "vault to bot float (2-of-3 proposal)",
    txSig: sig,
    rows: [
      { account: "reserve", amount: -amount },
      { account: "float", amount },
    ],
  });
  await closeDb();
}
process.exit(0); // web3 confirmation websockets keep the event loop alive on provider RPCs
