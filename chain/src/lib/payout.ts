// Payout: one transaction per policy that pays aUSD, writes the evidence Memo,
// and marks the policy paid, so the three can never get out of step.
import { createAssociatedTokenAccountIdempotentInstruction, createTransferCheckedInstruction } from "@solana/spl-token";
import { Keypair, PublicKey, TransactionInstruction } from "@solana/web3.js";
import { AUSD_DECIMALS, AUSD_PROGRAM_ID, ausdAta } from "./ausd.js";
import { evidenceMemo, memoIx } from "./memo.js";
import { setPolicyStatusIx } from "./policy.js";

export interface PayoutParams {
  bot: Keypair;
  issuer: Keypair;
  ausdMint: PublicKey;
  holder: PublicKey;
  policyMint: PublicKey;
  amountUnits: bigint;
  evidenceHash: string;
}

/** Signers: bot (fee payer, pays aUSD) and issuer (metadata update authority). */
export function payoutIxs(p: PayoutParams): TransactionInstruction[] {
  const holderAta = ausdAta(p.ausdMint, p.holder);
  return [
    createAssociatedTokenAccountIdempotentInstruction(
      p.bot.publicKey,
      holderAta,
      p.holder,
      p.ausdMint,
      AUSD_PROGRAM_ID,
    ),
    createTransferCheckedInstruction(
      ausdAta(p.ausdMint, p.bot.publicKey),
      p.ausdMint,
      holderAta,
      p.bot.publicKey,
      p.amountUnits,
      AUSD_DECIMALS,
      [],
      AUSD_PROGRAM_ID,
    ),
    memoIx(evidenceMemo(p.evidenceHash)),
    setPolicyStatusIx(p.policyMint, p.issuer.publicKey, "paid"),
  ];
}

/** Pay factor for a wave (plan 7.4): every policy in the wave gets the same share. */
export function payFactor(availableUnits: bigint, payoutUnits: bigint, policies: number): number {
  if (policies === 0 || payoutUnits === 0n) return 1;
  const needed = payoutUnits * BigInt(policies);
  if (availableUnits >= needed) return 1;
  return Number(availableUnits) / Number(needed);
}
