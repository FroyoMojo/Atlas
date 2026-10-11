// aUSD: our devnet test stablecoin. Classic SPL Token program, 6 decimals.
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";

export const AUSD_DECIMALS = 6;
export const AUSD_PROGRAM_ID = TOKEN_PROGRAM_ID;

export function toUnits(amount: number): bigint {
  return BigInt(Math.round(amount * 10 ** AUSD_DECIMALS));
}

export function fromUnits(units: bigint | number | string): number {
  return Number(BigInt(units)) / 10 ** AUSD_DECIMALS;
}

/** aUSD token account for an owner. Pass offCurve=true for PDAs such as the Squads vault. */
export function ausdAta(mint: PublicKey, owner: PublicKey, offCurve = false): PublicKey {
  return getAssociatedTokenAddressSync(mint, owner, offCurve, AUSD_PROGRAM_ID);
}
