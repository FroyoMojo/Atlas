// Postgres (Tiger Data) access for the chain side.
// Reads the engine's tables (gauges, trigger_events) and writes policies + payouts,
// following the schema in docs/plan section 6.2.
import pg from "pg";
import { env } from "./env.js";

let pool: pg.Pool | null = null;

export function db(): pg.Pool {
  if (!env.databaseUrl) throw new Error("DATABASE_URL is not set (see .env.example).");
  if (!pool) {
    pool = new pg.Pool({ connectionString: env.databaseUrl, max: 5 });
    pg.types.setTypeParser(1700, (v) => Number(v)); // NUMERIC -> number
  }
  return pool;
}

export async function closeDb(): Promise<void> {
  await pool?.end();
  pool = null;
}

// ---------- policy pool ----------

export async function insertPoolMint(row: {
  policyMint: string;
  policyId: string;
  gaugeId: string;
  termsHash: string;
}): Promise<void> {
  await db().query(
    `INSERT INTO policy_pool (policy_mint, policy_id, gauge_id, terms_hash) VALUES ($1, $2, $3, $4)`,
    [row.policyMint, row.policyId, row.gaugeId, row.termsHash],
  );
}

export interface Reservation {
  policyMint: string;
  policyId: string;
}

/** Reserve one free mint for a gauge for 2 minutes. Safe under concurrent buyers. */
export async function reservePolicyMint(
  gaugeId: string,
  buyer: string,
  premiumUsd: number,
  payoutUsd: number,
): Promise<Reservation | null> {
  const { rows } = await db().query(
    `UPDATE policy_pool SET status = 'reserved', reserved_by = $2,
            reserved_until = now() + INTERVAL '2 minutes', premium_usd = $3, payout_usd = $4
     WHERE policy_mint = (
       SELECT policy_mint FROM policy_pool
       WHERE gauge_id = $1 AND (status = 'free' OR (status = 'reserved' AND reserved_until < now()))
       ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED)
     RETURNING policy_mint, policy_id`,
    [gaugeId, buyer, premiumUsd, payoutUsd],
  );
  return rows[0] ? { policyMint: rows[0].policy_mint, policyId: rows[0].policy_id } : null;
}

export async function reservedMints(): Promise<
  { policy_mint: string; policy_id: string; gauge_id: string; reserved_by: string; premium_usd: number; payout_usd: number }[]
> {
  const { rows } = await db().query(`SELECT * FROM policy_pool WHERE status = 'reserved'`);
  return rows;
}

export async function poolCounts(): Promise<{ gauge_id: string; status: string; n: number }[]> {
  const { rows } = await db().query(
    `SELECT gauge_id, status, count(*)::int AS n FROM policy_pool GROUP BY gauge_id, status ORDER BY gauge_id, status`,
  );
  return rows;
}

/** Called by the confirmer once the mint shows supply 1 on-chain. */
export async function markSold(row: {
  policyMint: string;
  owner: string;
  gaugeId: string;
  premiumUsd: number;
  payoutUsd: number;
  waitingDays: number;
  demo: boolean;
}): Promise<void> {
  const client = await db().connect();
  try {
    await client.query("BEGIN");
    await client.query(`UPDATE policy_pool SET status = 'sold' WHERE policy_mint = $1`, [row.policyMint]);
    await client.query(
      `INSERT INTO policies (policy_mint, owner, gauge_id, payout_usd, premium_usd, starts_at, ends_at, status, demo)
       VALUES ($1, $2, $3, $4, $5, now() + make_interval(days => $6), now() + INTERVAL '365 days', 'active', $7)
       ON CONFLICT (policy_mint) DO NOTHING`,
      [row.policyMint, row.owner, row.gaugeId, row.payoutUsd, row.premiumUsd, row.waitingDays, row.demo],
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function poolRow(policyId: string) {
  const { rows } = await db().query(`SELECT * FROM policy_pool WHERE policy_id = $1`, [policyId]);
  return rows[0] ?? null;
}

// ---------- policies ----------

export async function policiesByOwner(owner: string) {
  const { rows } = await db().query(
    `SELECT policy_mint, gauge_id, payout_usd AS payout, premium_usd AS premium, starts_at, ends_at, status
     FROM policies WHERE owner = $1 ORDER BY starts_at DESC`,
    [owner],
  );
  return rows;
}

export async function demoPolicies(): Promise<{ policy_mint: string }[]> {
  const { rows } = await db().query(`SELECT policy_mint FROM policies WHERE demo AND status <> 'active'`);
  return rows;
}

export async function setPolicyStatusDb(policyMint: string, status: string): Promise<void> {
  await db().query(`UPDATE policies SET status = $2 WHERE policy_mint = $1`, [policyMint, status]);
}

// ---------- payout bot ----------

export interface WaveEvent {
  time: Date;
  gauge_id: string;
  run_id: string;
  wave_id: string;
  reading_ft: number;
  feed_value: number | null;
  feed_slot: string | null;
  evidence_hash: string | null;
  feed_pubkey: string | null;
}

/** Trigger events whose wave the bot has not processed yet, oldest first. */
export async function pendingWaveEvents(): Promise<WaveEvent[]> {
  const { rows } = await db().query(
    `SELECT e.time, e.gauge_id, e.run_id, e.wave_id, e.reading_ft, e.feed_value, e.feed_slot,
            e.evidence_hash, g.feed_pubkey
     FROM trigger_events e
     LEFT JOIN gauges g ON g.gauge_id = e.gauge_id
     WHERE NOT EXISTS (SELECT 1 FROM bot_waves b WHERE b.wave_id = e.wave_id AND b.run_id = e.run_id)
     ORDER BY e.time`,
  );
  return rows;
}

export interface EligiblePolicy {
  policy_mint: string;
  owner: string;
  gauge_id: string;
  payout_usd: number;
}

/** Active policies on these gauges, in force at the event time, not yet paid in this run. */
export async function eligiblePolicies(gaugeIds: string[], eventTime: Date, runId: string): Promise<EligiblePolicy[]> {
  const { rows } = await db().query(
    `SELECT p.policy_mint, p.owner, p.gauge_id, p.payout_usd
     FROM policies p
     WHERE p.gauge_id = ANY($1) AND p.status = 'active'
       AND p.starts_at <= $2 AND p.ends_at >= $2
       AND NOT EXISTS (SELECT 1 FROM payouts x WHERE x.policy_mint = p.policy_mint AND x.run_id = $3)`,
    [gaugeIds, eventTime, runId],
  );
  return rows;
}

export async function recordPayout(row: {
  runId: string;
  waveId: string;
  policyMint: string;
  owner: string;
  amountUsd: number;
  payFactor: number;
  txSig: string;
}): Promise<void> {
  const client = await db().connect();
  try {
    await client.query("BEGIN");
    // The payout transaction carries the Memo, so tx_sig and memo_sig are the same signature.
    await client.query(
      `INSERT INTO payouts (time, run_id, wave_id, policy_mint, owner, amount_usd, pay_factor, tx_sig, memo_sig)
       VALUES (now(), $1, $2, $3, $4, $5, $6, $7, $7)`,
      [row.runId, row.waveId, row.policyMint, row.owner, row.amountUsd, row.payFactor, row.txSig],
    );
    await client.query(`UPDATE policies SET status = 'paid' WHERE policy_mint = $1`, [row.policyMint]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function markWaveProcessed(waveId: string, runId: string, policies: number, payFactor: number) {
  await db().query(
    `INSERT INTO bot_waves (wave_id, run_id, policies, pay_factor) VALUES ($1, $2, $3, $4)
     ON CONFLICT DO NOTHING`,
    [waveId, runId, policies, payFactor],
  );
}
