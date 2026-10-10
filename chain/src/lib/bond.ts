// Catastrophe bond token: classic SPL mint, transferable units issued at NAV.
import {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createMintToInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import { AUSD_DECIMALS, AUSD_PROGRAM_ID, ausdAta } from "./ausd.js";
import { memoIx } from "./memo.js";
import { priorityFeeIx } from "./tx.js";

export const BOND_DECIMALS = 6;

export interface BondDepositParams {
  connection: Connection;
  investor: PublicKey;
  issuer: PublicKey;
  ausdMint: PublicKey;
  bondMint: PublicKey;
  vault: PublicKey;
  depositUnits: bigint;
  /** aUSD per bond unit, from the engine's /pool. 1.0 before any loss. */
  navPerUnit: number;
}

/**
 * Atomic: investor pays aUSD into the vault and receives deposit / NAV bond units. Returned
 * unsigned; the investor signs first and the server co-signs on submit (plan v3 8.8).
 */
export async function buildBondDepositTx(p: BondDepositParams): Promise<Transaction> {
  if (p.navPerUnit <= 0) throw new Error("NAV must be positive");
  const units = BigInt(Math.floor(Number(p.depositUnits) / p.navPerUnit));
  const investorBondAta = getAssociatedTokenAddressSync(p.bondMint, p.investor, false, TOKEN_PROGRAM_ID);
  const tx = new Transaction().add(
    priorityFeeIx(),
    createTransferCheckedInstruction(
      ausdAta(p.ausdMint, p.investor),
      p.ausdMint,
      ausdAta(p.ausdMint, p.vault, true),
      p.investor,
      p.depositUnits,
      AUSD_DECIMALS,
      [],
      AUSD_PROGRAM_ID,
    ),
    createAssociatedTokenAccountIdempotentInstruction(
      p.investor,
      investorBondAta,
      p.investor,
      p.bondMint,
      TOKEN_PROGRAM_ID,
    ),
    createMintToInstruction(p.bondMint, investorBondAta, p.issuer, units, [], TOKEN_PROGRAM_ID),
    memoIx(`atlas:bond:deposit:${p.navPerUnit.toFixed(6)}`),
  );
  const { blockhash, lastValidBlockHeight } = await p.connection.getLatestBlockhash("confirmed");
  tx.feePayer = p.investor;
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  return tx;
}
