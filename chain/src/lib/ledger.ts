// Double-entry ledger rows written by the chain service (plan v3 F2, 7.4).
// Every entry's rows sum to zero. Accounts say where money sits or comes from:
//   seeded     test aUSD minted at setup or reset (source of capital)
//   premiums   premiums paid into the vault
//   reserve    seeded reserve in the vault
//   bond       bond capital in the vault
//   float      the bot's payout float
//   holders    policyholders (external)
//   investors  bond investors (external; added to the v3 account list)
//   donations  donated sponsor funds in the vault (docs/readiness.md)
//   donors     sponsors (external)
// The engine owns the economic split (expenses, coupon, which layer absorbs a loss) and
// reconciliation; it reads these rows.
import type { PoolClient } from "pg";
import { inTx } from "../db.js";

export interface LedgerRow {
  account: "seeded" | "premiums" | "reserve" | "bond" | "float" | "holders" | "investors" | "donations" | "donors";
  amount: number;
}

/**
 * Write one balanced entry. Idempotent per entry_id: a second call with the same id (a retried
 * submit, two confirmers) writes nothing and returns false. The advisory lock serialises
 * concurrent writers of the same id; pass `client` to join the caller's transaction.
 */
export async function writeLedgerEntry(
  entry: { runId: string; entryId: string; memo: string; txSig?: string | null; rows: LedgerRow[] },
  client?: PoolClient,
): Promise<boolean> {
  const sum = entry.rows.reduce((s, r) => s + r.amount, 0);
  if (!entry.rows.every((r) => Number.isFinite(r.amount))) throw new Error(`ledger entry ${entry.entryId} has a non-finite amount`);
  if (Math.abs(sum) > 1e-9) throw new Error(`ledger entry ${entry.entryId} does not balance (${sum})`);
  const write = async (q: PoolClient) => {
    await q.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [entry.entryId]);
    const seen = await q.query(`SELECT 1 FROM ledger WHERE entry_id = $1 LIMIT 1`, [entry.entryId]);
    if (seen.rowCount) return false;
    for (const r of entry.rows) {
      await q.query(
        `INSERT INTO ledger (run_id, entry_id, account, amount, memo, tx_sig) VALUES ($1, $2, $3, $4, $5, $6)`,
        [entry.runId, entry.entryId, r.account, r.amount, entry.memo, entry.txSig ?? null],
      );
    }
    return true;
  };
  return client ? write(client) : inTx(write);
}
