// Sending transactions with a priority fee and a retry on expired blockhashes.
import {
  ComputeBudgetProgram,
  Connection,
  Signer,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { env } from "../env.js";

export function priorityFeeIx(): TransactionInstruction {
  return ComputeBudgetProgram.setComputeUnitPrice({ microLamports: env.priorityMicroLamports });
}

export async function sendIxs(
  connection: Connection,
  ixs: TransactionInstruction[],
  signers: Signer[],
  attempts = 3,
): Promise<string> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const tx = new Transaction().add(priorityFeeIx(), ...ixs);
      tx.feePayer = signers[0].publicKey;
      return await sendAndConfirmTransaction(connection, tx, signers, { commitment: "confirmed" });
    } catch (err) {
      lastError = err;
      const msg = String(err);
      const retryable = /blockhash|expired|timed out|429|Too Many Requests|fetch failed/i.test(msg);
      if (!retryable) throw err;
      await new Promise((r) => setTimeout(r, 1_000 * (i + 1)));
    }
  }
  throw lastError;
}

export function serializeForWallet(tx: Transaction): string {
  return tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64");
}
