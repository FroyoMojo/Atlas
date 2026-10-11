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

/**
 * Send with a priority fee. Retries expired blockhashes and RPC rate limits (429) with
 * exponential backoff; the public devnet RPC rate-limits hard, so use a provider URL for the demo.
 */
export async function sendIxs(
  connection: Connection,
  ixs: TransactionInstruction[],
  signers: Signer[],
  attempts = 6,
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
      const rateLimited = /429|Too Many Requests/i.test(msg);
      await new Promise((r) => setTimeout(r, rateLimited ? 2_000 * 2 ** i : 1_000 * (i + 1)));
    }
  }
  throw lastError;
}

export function serializeForWallet(tx: Transaction): string {
  return tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64");
}
