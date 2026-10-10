// Payout bot (plan 8.5). Polls trigger_events for new waves and pays every eligible policy
// in a wave with the same pay factor. Each payout is one transaction: aUSD transfer + evidence
// Memo + metadata status "paid". Never pays a policy twice in the same run.
import { getAccount } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import * as dbq from "../db.js";
import { connection, env, explorer, loadKeypair, requireState } from "../env.js";
import { AUSD_PROGRAM_ID, ausdAta, fromUnits, toUnits } from "../lib/ausd.js";
import { evidenceHash } from "../lib/memo.js";
import { payFactor, payoutIxs } from "../lib/payout.js";
import { readPolicy } from "../lib/policy.js";
import { sendIxs } from "../lib/tx.js";

const bot = loadKeypair("bot");
const issuer = loadKeypair("issuer");
const ausdMint = requireState("ausdMint");
const vault = requireState("vault");

async function balanceUnits(owner: PublicKey, offCurve = false): Promise<bigint> {
  try {
    const acct = await getAccount(connection, ausdAta(ausdMint, owner, offCurve), "confirmed", AUSD_PROGRAM_ID);
    return acct.amount;
  } catch {
    return 0n;
  }
}

function groupByWave(events: dbq.WaveEvent[]): Map<string, dbq.WaveEvent[]> {
  const waves = new Map<string, dbq.WaveEvent[]>();
  for (const e of events) {
    const key = `${e.run_id}::${e.wave_id}`;
    waves.set(key, [...(waves.get(key) ?? []), e]);
  }
  return waves;
}

function hashFor(e: dbq.WaveEvent): string {
  if (e.evidence_hash) return e.evidence_hash;
  return evidenceHash({
    gaugeId: e.gauge_id,
    valueFt: e.feed_value ?? e.reading_ft,
    time: new Date(e.time),
    runId: e.run_id,
    waveId: e.wave_id,
    feedAccount: e.feed_value != null ? (e.feed_pubkey ?? undefined) : undefined,
    feedSlot: e.feed_slot != null ? Number(e.feed_slot) : undefined,
  });
}

// Waves already reported as short of float, so the log isn't flooded every poll.
const warnedShort = new Set<string>();

async function processWave(events: dbq.WaveEvent[]): Promise<void> {
  const { run_id: runId, wave_id: waveId } = events[0];
  const eventTime = new Date(Math.max(...events.map((e) => new Date(e.time).getTime())));
  const byGauge = new Map(events.map((e) => [e.gauge_id, e]));
  const policies = await dbq.eligiblePolicies([...byGauge.keys()], eventTime, runId);

  // Pay factor over everything the pool holds (reserve + bond capital, all in the vault)
  // plus the bot's float. The bot can only pay from its float, so check that too.
  const botUnits = await balanceUnits(bot.publicKey);
  const available = (await balanceUnits(vault, true)) + botUnits;
  const payoutUnits = toUnits(policies[0]?.payout_usd ?? env.defaultPayout);
  const factor = payFactor(available, payoutUnits, policies.length);
  const perPolicy = BigInt(Math.floor(Number(payoutUnits) * factor));
  const needed = perPolicy * BigInt(policies.length);

  const key = `${runId}::${waveId}`;
  if (botUnits < needed) {
    if (!warnedShort.has(key)) {
      warnedShort.add(key);
      console.warn(
        `wave ${waveId} (run ${runId}) needs ${fromUnits(needed)} aUSD but the bot float is ` +
          `${fromUnits(botUnits)}. Fund it with \`npm run fund:bot\`; retrying quietly.`,
      );
    }
    return;
  }
  warnedShort.delete(key);
  console.log(
    `wave ${waveId} (run ${runId}): ${byGauge.size} gauge(s), ${policies.length} policy(ies), ` +
      `pay factor ${factor.toFixed(4)}, ${fromUnits(perPolicy)} aUSD each`,
  );

  for (const p of policies) {
    const e = byGauge.get(p.gauge_id)!;
    const mint = new PublicKey(p.policy_mint);
    // Cross-check on-chain state before paying (plan 8.5 step 2).
    const onchain = await readPolicy(connection, mint);
    if (onchain.holder !== p.owner || onchain.fields.status !== "active" || onchain.fields.gauge_id !== p.gauge_id) {
      console.warn(
        `  skip ${p.policy_mint}: on-chain holder=${onchain.holder} status=${onchain.fields.status} ` +
          `gauge=${onchain.fields.gauge_id} does not match the database`,
      );
      continue;
    }
    const sig = await sendIxs(
      connection,
      payoutIxs({
        bot,
        issuer,
        ausdMint,
        holder: new PublicKey(p.owner),
        policyMint: mint,
        amountUnits: perPolicy,
        evidenceHash: hashFor(e),
      }),
      [bot, issuer],
    );
    await dbq.recordPayout({
      runId,
      waveId,
      policyMint: p.policy_mint,
      owner: p.owner,
      amountUsd: fromUnits(perPolicy),
      payFactor: factor,
      txSig: sig,
    });
    console.log(`  paid ${fromUnits(perPolicy)} aUSD to ${p.owner}: ${explorer(sig)}`);
  }
  await dbq.markWaveProcessed(waveId, runId, policies.length, factor);
}

let running = false;
async function tick(): Promise<void> {
  if (running) return;
  running = true;
  try {
    for (const events of groupByWave(await dbq.pendingWaveEvents()).values()) {
      await processWave(events);
    }
  } catch (err) {
    console.error("bot tick failed:", err);
  } finally {
    running = false;
  }
}

console.log(`payout bot ${bot.publicKey.toBase58()} polling every ${env.botPollMs} ms`);
await tick();
setInterval(() => void tick(), env.botPollMs);
