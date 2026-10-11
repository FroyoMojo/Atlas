// Sponsor donation (docs/readiness.md): aUSD from the donor straight into the vault, no units in
// return. It raises the pool's readiness and, with READINESS_PRICING on, lowers the price.
import { createTransferCheckedInstruction } from "@solana/spl-token";
import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import { AUSD_DECIMALS, AUSD_PROGRAM_ID, ausdAta } from "./ausd.js";
import { memoIx } from "./memo.js";
import { priorityFeeIx } from "./tx.js";

export interface DonationParams {
  connection: Connection;
  donor: PublicKey;
  ausdMint: PublicKey;
  vault: PublicKey;
  amountUnits: bigint;
}

/** Returned unsigned; the donor signs and the server checks it against the quote and sends it. */
export async function buildDonationTx(p: DonationParams): Promise<Transaction> {
  const tx = new Transaction().add(
    priorityFeeIx(),
    createTransferCheckedInstruction(
      ausdAta(p.ausdMint, p.donor),
      p.ausdMint,
      ausdAta(p.ausdMint, p.vault, true),
      p.donor,
      p.amountUnits,
      AUSD_DECIMALS,
      [],
      AUSD_PROGRAM_ID,
    ),
    memoIx("atlas:donation"),
  );
  const { blockhash, lastValidBlockHeight } = await p.connection.getLatestBlockhash("confirmed");
  tx.feePayer = p.donor;
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  return tx;
}
