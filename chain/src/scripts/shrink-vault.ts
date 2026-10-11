// Shrink the Squads vault to a target balance by sending the excess aUSD to the treasury through a
// full 2-of-3 proposal. Reset only tops balances UP to the snapshot, so this is how the live vault is
// sized down for the readiness demo (docs/readiness.md), where the pool must start small against the
// cover sold. Run it right after a Reset (no run in progress), then check with `npm run status`.
//   npm run shrink:vault -- [targetAUSD=600]
import { getAccount, getOrCreateAssociatedTokenAccount } from "@solana/spl-token";
import { connection, env, explorer, loadKeypair, requireState } from "../env.js";
import { ausdAta, fromUnits, toUnits } from "../lib/ausd.js";
import { vaultTransferAusd } from "../lib/squads.js";

const target = Number(process.argv[2] ?? 600);
const treasury = loadKeypair("treasury");
const ausdMint = requireState("ausdMint");
const vault = requireState("vault");

const have = fromUnits((await getAccount(connection, ausdAta(ausdMint, vault, true))).amount);
const excess = have - target;
if (!(excess > 0)) {
  console.log(`vault holds ${have} aUSD, at or below the target ${target}: nothing to move`);
  process.exit(0);
}
console.log(`vault holds ${have} aUSD; moving ${excess} to the treasury to leave ${target}`);
await getOrCreateAssociatedTokenAccount(connection, treasury, ausdMint, treasury.publicKey);
const sig = await vaultTransferAusd({
  connection,
  multisigPda: requireState("multisig"),
  ausdMint,
  to: treasury.publicKey,
  amountUnits: toUnits(excess),
  approvers: [loadKeypair("member1"), loadKeypair("member2")],
  timeLockSeconds: env.squadsTimeLockSeconds,
  log: console.log,
});
console.log(`moved ${excess} aUSD from vault to treasury: ${explorer(sig)}`);

// Ledger: reserve -> seeded (the reverse of a Reset refill), if the database is configured.
if (env.databaseUrl) {
  const { currentRunId, closeDb } = await import("../db.js");
  const { writeLedgerEntry } = await import("../lib/ledger.js");
  await writeLedgerEntry({
    runId: await currentRunId(),
    entryId: `shrink:${sig}`,
    memo: `vault shrunk to ${target} (2-of-3 proposal to treasury)`,
    txSig: sig,
    rows: [
      { account: "reserve", amount: -excess },
      { account: "seeded", amount: excess },
    ],
  });
  await closeDb();
}
process.exit(0); // web3 confirmation websockets keep the event loop alive on provider RPCs
