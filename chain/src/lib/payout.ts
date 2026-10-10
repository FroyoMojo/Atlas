// Payout instructions (plan v3 8.5). Interim: pay + Memo + status/name PAID, in one transaction.
// True-up: pay + Memo only (the policy is already PAID).
import { createAssociatedTokenAccountIdempotentInstruction, createTransferCheckedInstruction } from "@solana/spl-token";
import { Keypair, PublicKey, TransactionInstruction } from "@solana/web3.js";
import { AUSD_DECIMALS, AUSD_PROGRAM_ID, ausdAta } from "./ausd.js";
import { evidenceMemo, memoIx } from "./memo.js";
import { setPolicyStatusIxs } from "./policy.js";

export type PayoutKind = "interim" | "trueup";

export interface PayoutParams {
  kind: PayoutKind;
  bot: Keypair;
  issuer: Keypair;
  ausdMint: PublicKey;
  holder: PublicKey;
  policyMint: PublicKey;
  amountUnits: bigint;
  evidenceHash: string;
}

/** Signers: bot (fee payer, pays from the float) and, for interim, issuer (metadata authority). */
export function payoutIxs(p: PayoutParams): TransactionInstruction[] {
  const holderAta = ausdAta(p.ausdMint, p.holder);
  const ixs = [
    createAssociatedTokenAccountIdempotentInstruction(p.bot.publicKey, holderAta, p.holder, p.ausdMint, AUSD_PROGRAM_ID),
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
  ];
  if (p.kind === "interim") ixs.push(...setPolicyStatusIxs(p.policyMint, p.issuer.publicKey, "PAID"));
  return ixs;
}

export function payoutSigners(p: PayoutParams): Keypair[] {
  return p.kind === "interim" ? [p.bot, p.issuer] : [p.bot];
}
