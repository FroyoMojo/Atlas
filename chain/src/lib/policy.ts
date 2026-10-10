// Policy tokens: Token-2022 mints with supply 1, NonTransferable, on-mint metadata,
// and (optionally) a PermanentDelegate used only to burn at expiry.
import {
  AuthorityType,
  ExtensionType,
  LENGTH_SIZE,
  TOKEN_2022_PROGRAM_ID,
  TYPE_SIZE,
  createAssociatedTokenAccountIdempotentInstruction,
  createInitializeMetadataPointerInstruction,
  createInitializeMintInstruction,
  createInitializeNonTransferableMintInstruction,
  createInitializePermanentDelegateInstruction,
  createMintToInstruction,
  createSetAuthorityInstruction,
  createTransferCheckedInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
  getMint,
  getMintLen,
  getTokenMetadata,
} from "@solana/spl-token";
import {
  TokenMetadata,
  createInitializeInstruction,
  createUpdateFieldInstruction,
  pack,
} from "@solana/spl-token-metadata";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { createHash } from "node:crypto";
import { AUSD_DECIMALS, AUSD_PROGRAM_ID, ausdAta } from "./ausd.js";
import { memoIx } from "./memo.js";
import { priorityFeeIx } from "./tx.js";

/** Hash of the standard terms for a gauge; stored in each policy's metadata. */
export function termsHash(gaugeId: string): string {
  return createHash("sha256").update(`atlas-terms-v1|${gaugeId}`).digest("hex");
}

export type PolicyStatus = "active" | "paid" | "expired";

// Extra metadata bytes paid for up front so a status change (e.g. "paid" -> "active" on reset)
// never needs a rent top-up.
const METADATA_SLACK_BYTES = 64;

export interface PolicyFields {
  policyId: string;
  gaugeId: string;
  termsHash: string;
  /** Public JSON with the full terms (payout, premium, start, end). */
  uri: string;
}

export interface PolicyMintPlan {
  mint: Keypair;
  instructions: TransactionInstruction[];
}

/**
 * Instructions that create one unminted policy mint with metadata.
 * Order matters: account, then extensions, then initializeMint, then metadata.
 * Signers: payer, the new mint keypair, issuer.
 */
export async function planPolicyMint(
  connection: Connection,
  payer: PublicKey,
  issuer: PublicKey,
  fields: PolicyFields,
  opts: { permanentDelegate: boolean },
): Promise<PolicyMintPlan> {
  const mint = Keypair.generate();
  const extensions = [ExtensionType.NonTransferable, ExtensionType.MetadataPointer];
  if (opts.permanentDelegate) extensions.push(ExtensionType.PermanentDelegate);

  const metadata: TokenMetadata = {
    mint: mint.publicKey,
    updateAuthority: issuer,
    name: `Atlas policy ${fields.policyId}`,
    symbol: "ATLAS",
    uri: fields.uri,
    additionalMetadata: [
      ["policy_id", fields.policyId],
      ["gauge_id", fields.gaugeId],
      ["status", "active"],
      ["terms_hash", fields.termsHash],
    ],
  };

  const mintLen = getMintLen(extensions);
  const metadataLen = TYPE_SIZE + LENGTH_SIZE + pack(metadata).length + METADATA_SLACK_BYTES;
  const lamports = await connection.getMinimumBalanceForRentExemption(mintLen + metadataLen);

  const ixs: TransactionInstruction[] = [
    SystemProgram.createAccount({
      fromPubkey: payer,
      newAccountPubkey: mint.publicKey,
      space: mintLen,
      lamports,
      programId: TOKEN_2022_PROGRAM_ID,
    }),
    createInitializeNonTransferableMintInstruction(mint.publicKey, TOKEN_2022_PROGRAM_ID),
  ];
  if (opts.permanentDelegate) {
    ixs.push(createInitializePermanentDelegateInstruction(mint.publicKey, issuer, TOKEN_2022_PROGRAM_ID));
  }
  ixs.push(
    createInitializeMetadataPointerInstruction(mint.publicKey, issuer, mint.publicKey, TOKEN_2022_PROGRAM_ID),
    createInitializeMintInstruction(mint.publicKey, 0, issuer, null, TOKEN_2022_PROGRAM_ID),
    createInitializeInstruction({
      programId: TOKEN_2022_PROGRAM_ID,
      metadata: mint.publicKey,
      updateAuthority: issuer,
      mint: mint.publicKey,
      mintAuthority: issuer,
      name: metadata.name,
      symbol: metadata.symbol,
      uri: metadata.uri,
    }),
    ...metadata.additionalMetadata.map(([field, value]) =>
      createUpdateFieldInstruction({
        programId: TOKEN_2022_PROGRAM_ID,
        metadata: mint.publicKey,
        updateAuthority: issuer,
        field,
        value,
      }),
    ),
  );
  return { mint, instructions: ixs };
}

export function setPolicyStatusIx(mint: PublicKey, issuer: PublicKey, status: PolicyStatus): TransactionInstruction {
  return createUpdateFieldInstruction({
    programId: TOKEN_2022_PROGRAM_ID,
    metadata: mint,
    updateAuthority: issuer,
    field: "status",
    value: status,
  });
}

export function policyAta(mint: PublicKey, owner: PublicKey): PublicKey {
  return getAssociatedTokenAddressSync(mint, owner, false, TOKEN_2022_PROGRAM_ID);
}

export interface PurchaseParams {
  connection: Connection;
  buyer: PublicKey;
  policyMint: PublicKey;
  policyId: string;
  issuer: Keypair;
  ausdMint: PublicKey;
  vault: PublicKey;
  premiumUnits: bigint;
}

/**
 * One atomic transaction: premium to the vault + mint the policy + lock supply at 1.
 * The issuer partially signs; the buyer signs as fee payer and sends it.
 */
export async function buildPurchaseTx(p: PurchaseParams): Promise<Transaction> {
  const buyerPolicyAta = policyAta(p.policyMint, p.buyer);
  const tx = new Transaction().add(
    priorityFeeIx(),
    createAssociatedTokenAccountIdempotentInstruction(
      p.buyer,
      buyerPolicyAta,
      p.buyer,
      p.policyMint,
      TOKEN_2022_PROGRAM_ID,
    ),
    createTransferCheckedInstruction(
      ausdAta(p.ausdMint, p.buyer),
      p.ausdMint,
      ausdAta(p.ausdMint, p.vault, true),
      p.buyer,
      p.premiumUnits,
      AUSD_DECIMALS,
      [],
      AUSD_PROGRAM_ID,
    ),
    createMintToInstruction(p.policyMint, buyerPolicyAta, p.issuer.publicKey, 1, [], TOKEN_2022_PROGRAM_ID),
    createSetAuthorityInstruction(
      p.policyMint,
      p.issuer.publicKey,
      AuthorityType.MintTokens,
      null,
      [],
      TOKEN_2022_PROGRAM_ID,
    ),
    memoIx(`atlas:buy:${p.policyId}`),
  );
  const { blockhash, lastValidBlockHeight } = await p.connection.getLatestBlockhash("confirmed");
  tx.feePayer = p.buyer;
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  tx.partialSign(p.issuer);
  return tx;
}

export interface OnChainPolicy {
  mint: string;
  supply: bigint;
  holder: string | null;
  fields: Record<string, string>;
  name: string;
  uri: string;
}

export async function readPolicy(connection: Connection, mint: PublicKey): Promise<OnChainPolicy> {
  const [mintInfo, metadata] = await Promise.all([
    getMint(connection, mint, "confirmed", TOKEN_2022_PROGRAM_ID),
    getTokenMetadata(connection, mint, "confirmed", TOKEN_2022_PROGRAM_ID),
  ]);
  let holder: string | null = null;
  if (mintInfo.supply > 0n) {
    const largest = await connection.getTokenLargestAccounts(mint, "confirmed");
    const top = largest.value.find((a) => a.uiAmount === 1);
    if (top) {
      const account = await getAccount(connection, top.address, "confirmed", TOKEN_2022_PROGRAM_ID);
      holder = account.owner.toBase58();
    }
  }
  return {
    mint: mint.toBase58(),
    supply: mintInfo.supply,
    holder,
    fields: Object.fromEntries(metadata?.additionalMetadata ?? []),
    name: metadata?.name ?? "",
    uri: metadata?.uri ?? "",
  };
}
