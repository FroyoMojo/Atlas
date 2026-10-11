// Create the 2-of-3 Squads vault, its aUSD account, and seed the premium reserve.
//   npm run setup:multisig -- [reserveAUSD=300]
import { createAssociatedTokenAccountIdempotentInstruction, getOrCreateAssociatedTokenAccount, transferChecked } from "@solana/spl-token";
import { connection, env, explorer, loadKeypair, loadState, saveState } from "../env.js";
import { AUSD_DECIMALS, AUSD_PROGRAM_ID, ausdAta, toUnits } from "../lib/ausd.js";
import { createMultisig } from "../lib/squads.js";
import { sendIxs } from "../lib/tx.js";
import { PublicKey } from "@solana/web3.js";

const treasury = loadKeypair("treasury");
const members = (["member1", "member2", "member3"] as const).map((n) => loadKeypair(n).publicKey);
const state = loadState();
if (!state.ausdMint) throw new Error("Run setup:ausd first");
const ausdMint = new PublicKey(state.ausdMint);

let vault: PublicKey;
if (state.multisig && state.vault) {
  vault = new PublicKey(state.vault);
  console.log(`multisig already exists: ${state.multisig}`);
} else {
  const ms = await createMultisig(connection, treasury, members, 2, env.squadsTimeLockSeconds);
  vault = ms.vault;
  saveState({ multisig: ms.multisigPda.toBase58(), multisigCreateKey: ms.createKey.toBase58(), vault: vault.toBase58() });
  console.log(`multisig ${ms.multisigPda.toBase58()}  ${explorer(ms.signature)}`);
  console.log(`time lock ${env.squadsTimeLockSeconds}s, threshold 2 of 3`);
}

// The vault is a PDA: its token account must be derived with allowOwnerOffCurve = true.
const vaultAta = ausdAta(ausdMint, vault, true);
await sendIxs(connection, [createAssociatedTokenAccountIdempotentInstruction(treasury.publicKey, vaultAta, vault, ausdMint, AUSD_PROGRAM_ID)], [treasury]);
console.log(`vault ${vault.toBase58()}  aUSD account ${vaultAta.toBase58()}`);

const reserve = Number(process.argv[2] ?? 300);
if (reserve > 0) {
  const from = await getOrCreateAssociatedTokenAccount(connection, treasury, ausdMint, treasury.publicKey);
  await transferChecked(connection, treasury, from.address, ausdMint, vaultAta, treasury, toUnits(reserve), AUSD_DECIMALS);
  console.log(`seeded vault with ${reserve} aUSD premium reserve`);
}
process.exit(0); // web3 confirmation websockets keep the event loop alive on provider RPCs
