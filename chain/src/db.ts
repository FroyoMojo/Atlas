// Postgres (Tiger Data) access for the chain side, against the plan v3 schema (section 6.2).
// Engine tables read: gauges, runs, storms, gauge_events. Written: policies, ledger.
// Chain tables: policy_pool, payout_intents (sql/001_chain_tables.sql).
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

export async function inTx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await db().connect();
  try {
    await client.query("BEGIN");
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Run that money movements belong to. A purchase or deposit made while no replay is running
 * (e.g. bought on stage before Start) is booked to "session" (audit fix: v3 left this undefined).
 */
export async function currentRunId(): Promise<string> {
  const { rows } = await db().query(
    `SELECT run_id FROM runs WHERE status = 'running' ORDER BY started_wall DESC LIMIT 1`,
  );
  return rows[0]?.run_id ?? "session";
}

// ---------- policy pool ----------

export async function insertPoolMint(row: { policyMint: string; policyId: string; gaugeId: string; termsHash: string }) {
  await db().query(
    `INSERT INTO policy_pool (policy_mint, policy_id, gauge_id, terms_hash) VALUES ($1, $2, $3, $4)`,
    [row.policyMint, row.policyId, row.gaugeId, row.termsHash],
  );
}

export async function activeReservationFor(buyer: string): Promise<string | null> {
  const { rows } = await db().query(
    `SELECT policy_mint FROM policy_pool WHERE reserved_by = $1 AND status = 'reserved' AND reserved_until > now()`,
    [buyer],
  );
  return rows[0]?.policy_mint ?? null;
}

/** Reserve one free mint for a gauge for 2 minutes. Safe under concurrent buyers. */
export async function reservePolicyMint(gaugeId: string, buyer: string, premiumUsd: number, payoutUsd: number) {
  const { rows } = await db().query(
    `UPDATE policy_pool SET status = 'reserved', reserved_by = $2, message_hash = NULL,
            reserved_until = now() + INTERVAL '2 minutes', premium_usd = $3, payout_usd = $4
     WHERE policy_mint = (
       SELECT policy_mint FROM policy_pool
       WHERE gauge_id = $1 AND (status = 'free' OR (status = 'reserved' AND reserved_until < now()))
       ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED)
     RETURNING policy_mint, policy_id`,
    [gaugeId, buyer, premiumUsd, payoutUsd],
  );
  return rows[0] ? { policyMint: rows[0].policy_mint as string, policyId: rows[0].policy_id as string } : null;
}

export async function setReservationMessageHash(policyMint: string, hash: string) {
  await db().query(`UPDATE policy_pool SET message_hash = $2 WHERE policy_mint = $1`, [policyMint, hash]);
}

export async function reservationByMessageHash(hash: string) {
  const { rows } = await db().query(
    `SELECT * FROM policy_pool WHERE message_hash = $1 AND status = 'reserved' AND reserved_until > now()`,
    [hash],
  );
  return rows[0] ?? null;
}

export async function reservedMints(): Promise<
  { policy_mint: string; policy_id: string; gauge_id: string; reserved_by: string; premium_usd: number; payout_usd: number }[]
> {
  const { rows } = await db().query(`SELECT * FROM policy_pool WHERE status = 'reserved'`);
  return rows;
}

export async function releaseReservations(): Promise<number> {
  const r = await db().query(
    `UPDATE policy_pool SET status = 'free', reserved_by = NULL, reserved_until = NULL, message_hash = NULL
     WHERE status = 'reserved'`,
  );
  return r.rowCount ?? 0;
}

export async function poolCounts() {
  const { rows } = await db().query(
    `SELECT gauge_id, status, count(*)::int AS n FROM policy_pool GROUP BY gauge_id, status ORDER BY gauge_id, status`,
  );
  return rows;
}

export async function poolRow(policyId: string) {
  const { rows } = await db().query(`SELECT * FROM policy_pool WHERE policy_id = $1`, [policyId]);
  return rows[0] ?? null;
}

/** Called once the mint shows supply 1 on-chain: policy row + premium ledger entry. */
export async function markSold(
  row: {
    policyMint: string;
    owner: string;
    gaugeId: string;
    premiumUsd: number;
    payoutUsd: number;
    waitingDays: number;
    termDays: number;
    demo: boolean;
    txSig: string | null;
  },
  writeEntry: (c: pg.PoolClient, runId: string) => Promise<void>,
): Promise<void> {
  const runId = await currentRunId();
  await inTx(async (c) => {
    await c.query(`UPDATE policy_pool SET status = 'sold' WHERE policy_mint = $1`, [row.policyMint]);
    const ins = await c.query(
      `INSERT INTO policies (policy_mint, owner, gauge_id, payout_usd, premium_usd, starts_at, ends_at, status, paid_amount, demo)
       VALUES ($1, $2, $3, $4, $5, now() + make_interval(days => $6), now() + make_interval(days => $7), 'ACTV', 0, $8)
       ON CONFLICT (policy_mint) DO NOTHING`,
      [row.policyMint, row.owner, row.gaugeId, row.payoutUsd, row.premiumUsd, row.waitingDays, row.termDays, row.demo],
    );
    if (ins.rowCount) await writeEntry(c, runId);
  });
}

// ---------- policies ----------

export async function policiesByOwner(owner: string) {
  const { rows } = await db().query(
    `SELECT p.policy_mint, p.gauge_id, g.name AS gauge_name, p.payout_usd AS payout, p.premium_usd AS premium,
            p.starts_at, p.ends_at, p.status, p.paid_amount,
            (SELECT json_build_object('amount', i.amount, 'kind', i.kind, 'tx_sig', i.tx_sig, 'at', i.confirmed_wall)
               FROM payout_intents i
              WHERE i.policy_mint = p.policy_mint AND i.status = 'confirmed'
              ORDER BY i.confirmed_wall DESC LIMIT 1) AS last_payout
     FROM policies p LEFT JOIN gauges g ON g.gauge_id = p.gauge_id
     WHERE p.owner = $1 ORDER BY p.starts_at DESC`,
    [owner],
  );
  return rows;
}

export async function demoPolicyMints(): Promise<string[]> {
  const { rows } = await db().query(`SELECT policy_mint FROM policies WHERE demo`);
  return rows.map((r) => r.policy_mint);
}

export async function resetDemoPoliciesDb(): Promise<void> {
  await db().query(`UPDATE policies SET status = 'ACTV', paid_amount = 0 WHERE demo`);
}

// ---------- storms, events, intents (payout bot) ----------

export interface Storm {
  storm_id: string;
  run_id: string;
  status: "open" | "closed" | "trued_up";
  f_int: number | null;
  f_fin: number | null;
}

export async function stormsToProcess(): Promise<Storm[]> {
  const { rows } = await db().query(
    `SELECT s.storm_id, s.run_id, s.status, s.f_int, s.f_fin
     FROM storms s JOIN runs r ON r.run_id = s.run_id
     WHERE s.status IN ('open', 'closed') AND r.status <> 'reset'
     ORDER BY s.opened_at`,
  );
  return rows;
}

export interface GaugeEvent {
  event_id: string;
  run_id: string;
  storm_id: string;
  gauge_id: string;
  gauge_name: string | null;
  opened_at: Date;
  latched_value: number;
  feed_pubkey: string | null;
  feed_slot: string | null;
  preimage: string;
  evidence_hash: string;
}

export async function stormEvents(stormId: string): Promise<GaugeEvent[]> {
  const { rows } = await db().query(
    `SELECT e.*, g.name AS gauge_name FROM gauge_events e LEFT JOIN gauges g USING (gauge_id)
     WHERE e.storm_id = $1 ORDER BY e.opened_at`,
    [stormId],
  );
  return rows;
}

export interface EligiblePolicy {
  policy_mint: string;
  owner: string;
  gauge_id: string;
  payout_usd: number;
}

/**
 * ACTV policies on a gauge in force at the event's opened_at (event time, never now(): plan v3
 * F9), with no interim intent yet in this storm.
 */
export async function interimCandidates(gaugeId: string, eventTime: Date, stormId: string): Promise<EligiblePolicy[]> {
  const { rows } = await db().query(
    `SELECT p.policy_mint, p.owner, p.gauge_id, p.payout_usd
     FROM policies p
     WHERE p.gauge_id = $1 AND p.status = 'ACTV' AND p.starts_at <= $2 AND $2 < p.ends_at
       AND NOT EXISTS (SELECT 1 FROM payout_intents i
                       WHERE i.policy_mint = p.policy_mint AND i.storm_id = $3 AND i.kind = 'interim'
                         AND i.status <> 'expired')`,
    [gaugeId, eventTime, stormId],
  );
  return rows;
}

export interface Intent {
  intent_id: string;
  run_id: string;
  storm_id: string;
  event_id: string;
  policy_mint: string;
  owner: string;
  gauge_id: string;
  kind: "interim" | "trueup";
  amount: number;
  tx_sig: string;
  last_valid_block_height: string;
  status: "signed" | "sent" | "confirmed" | "expired";
  attempts: number;
}

export async function intentsForStorm(stormId: string, kind: "interim" | "trueup"): Promise<Intent[]> {
  const { rows } = await db().query(`SELECT * FROM payout_intents WHERE storm_id = $1 AND kind = $2`, [stormId, kind]);
  return rows;
}

export async function getIntent(intentId: string): Promise<Intent | null> {
  const { rows } = await db().query(`SELECT * FROM payout_intents WHERE intent_id = $1`, [intentId]);
  return rows[0] ?? null;
}

export async function unsettledIntents(): Promise<Intent[]> {
  const { rows } = await db().query(`SELECT * FROM payout_intents WHERE status IN ('signed', 'sent')`);
  return rows;
}

/**
 * Plan v3 8.6 step 3: record the intent with its signature BEFORE sending. Returns false if an
 * attempt is already in flight or confirmed, in which case the caller must not send.
 */
export async function upsertSignedIntent(i: Omit<Intent, "status" | "attempts">): Promise<boolean> {
  const r = await db().query(
    `INSERT INTO payout_intents (intent_id, run_id, storm_id, event_id, policy_mint, owner, gauge_id, kind, amount,
                                 tx_sig, last_valid_block_height, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'signed')
     ON CONFLICT (intent_id) DO UPDATE
       SET tx_sig = EXCLUDED.tx_sig, last_valid_block_height = EXCLUDED.last_valid_block_height,
           amount = EXCLUDED.amount, status = 'signed', attempts = payout_intents.attempts + 1
     WHERE payout_intents.status = 'expired'
     RETURNING intent_id`,
    [i.intent_id, i.run_id, i.storm_id, i.event_id, i.policy_mint, i.owner, i.gauge_id, i.kind, i.amount,
     i.tx_sig, i.last_valid_block_height],
  );
  return (r.rowCount ?? 0) > 0;
}

export async function setIntentStatus(intentId: string, status: "sent" | "expired"): Promise<void> {
  await db().query(`UPDATE payout_intents SET status = $2 WHERE intent_id = $1 AND status <> 'confirmed'`, [intentId, status]);
}

/**
 * Mark confirmed exactly once; only the call that flips it writes ledger and policy rows.
 * Returns false if it was already confirmed.
 */
export async function confirmIntent(
  intentId: string,
  writeEntry: (c: pg.PoolClient, i: Intent) => Promise<void>,
): Promise<boolean> {
  return inTx(async (c) => {
    const r = await c.query(
      `UPDATE payout_intents SET status = 'confirmed', confirmed_wall = now()
       WHERE intent_id = $1 AND status <> 'confirmed' RETURNING *`,
      [intentId],
    );
    const i = r.rows[0] as Intent | undefined;
    if (!i) return false;
    await c.query(
      `UPDATE policies SET paid_amount = paid_amount + $2, status = CASE WHEN $3 = 'interim' THEN 'PAID' ELSE status END
       WHERE policy_mint = $1`,
      [i.policy_mint, i.amount, i.kind],
    );
    await writeEntry(c, i);
    return true;
  });
}

export async function markStormTruedUp(stormId: string): Promise<void> {
  await db().query(`UPDATE storms SET status = 'trued_up' WHERE storm_id = $1 AND status = 'closed'`, [stormId]);
}
