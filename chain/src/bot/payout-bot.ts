// Payout bot (plan v3 7.5, 8.5, 8.6).
//
// Per storm: every policy on a triggered gauge gets the interim amount f_int * B as soon as its
// gauge's event opens, whatever order gauges cross in. When the engine closes the storm and sets
// f_fin, every interim-paid policy gets the true-up (f_fin - f_int) * B. f_int and f_fin come
// from the engine (storms table); the bot never computes them.
//
// Idempotency: intent_id = sha256(policy_mint|storm_id|kind). Each transaction is signed, the
// intent is written with its signature, and only then sent. On restart every unsettled intent is
// checked on-chain before anything new is built.
import { getAccount } from "@solana/spl-token";
import { PublicKey, Transaction } from "@solana/web3.js";
import bs58 from "bs58";
import * as dbq from "../db.js";
import { connection, env, explorer, loadKeypair, requireState } from "../env.js";
import { AUSD_PROGRAM_ID, ausdAta, fromUnits, toUnits } from "../lib/ausd.js";
import { writeLedgerEntry } from "../lib/ledger.js";
import { sha256Hex } from "../lib/memo.js";
import { PayoutKind, payoutIxs, payoutSigners } from "../lib/payout.js";
import { readPolicy } from "../lib/policy.js";
import { priorityFeeIx } from "../lib/tx.js";

const bot = loadKeypair("bot");
const issuer = loadKeypair("issuer");
const ausdMint = requireState("ausdMint");

const intentIdFor = (mint: string, stormId: string, kind: PayoutKind) => sha256Hex(`${mint}|${stormId}|${kind}`);

async function floatUnits(): Promise<bigint> {
  try {
    return (await getAccount(connection, ausdAta(ausdMint, bot.publicKey), "confirmed", AUSD_PROGRAM_ID)).amount;
  } catch {
    return 0n;
  }
}

// Ledger entry for a confirmed payout: money leaves the float to a holder.
const payoutEntry = (c: Parameters<Parameters<typeof dbq.confirmIntent>[1]>[0], i: dbq.Intent) =>
  writeLedgerEntry(
    {
      runId: i.run_id,
      entryId: `payout:${i.intent_id}`,
      memo: `${i.kind} payout, storm ${i.storm_id}, gauge ${i.gauge_id}`,
      txSig: i.tx_sig,
      rows: [
        { account: "float", amount: -i.amount },
        { account: "holders", amount: i.amount },
      ],
    },
    c,
  );

async function finalize(i: dbq.Intent): Promise<void> {
  if (await dbq.confirmIntent(i.intent_id, payoutEntry)) {
    console.log(`  ${i.kind} ${i.amount} aUSD to ${i.owner} confirmed: ${explorer(i.tx_sig)}`);
  }
}

/** Plan v3 8.6 step 4: settle anything signed or sent before the last stop. */
async function recoverIntents(): Promise<void> {
  const open = await dbq.unsettledIntents();
  if (!open.length) return;
  const statuses = await connection.getSignatureStatuses(open.map((i) => i.tx_sig), { searchTransactionHistory: true });
  const height = await connection.getBlockHeight("confirmed");
  for (const [n, i] of open.entries()) {
    const st = statuses.value[n];
    if (st && !st.err && (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized")) {
      await finalize(i);
    } else if (st?.err) {
      console.warn(`  intent ${i.intent_id.slice(0, 8)} failed on-chain (${JSON.stringify(st.err)}); will retry`);
      await dbq.setIntentStatus(i.intent_id, "expired");
    } else if (!st && height > Number(i.last_valid_block_height)) {
      await dbq.setIntentStatus(i.intent_id, "expired"); // never landed; blockhash gone; rebuild
    }
    // not found and blockhash still valid: wait
  }
}

async function pay(p: {
  kind: PayoutKind;
  storm: dbq.Storm;
  event: dbq.GaugeEvent;
  policyMint: string;
  owner: string;
  amount: number;
}): Promise<void> {
  const intentId = intentIdFor(p.policyMint, p.storm.storm_id, p.kind);
  const existing = await dbq.getIntent(intentId);
  if (existing && existing.status !== "expired") return;

  const params = {
    kind: p.kind,
    bot,
    issuer,
    ausdMint,
    holder: new PublicKey(p.owner),
    policyMint: new PublicKey(p.policyMint),
    amountUnits: toUnits(p.amount),
    evidenceHash: p.event.evidence_hash,
  };
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction({ feePayer: bot.publicKey, blockhash, lastValidBlockHeight }).add(
    priorityFeeIx(),
    ...payoutIxs(params),
  );
  tx.sign(...payoutSigners(params));
  const sig = bs58.encode(tx.signature!);

  const recorded = await dbq.upsertSignedIntent({
    intent_id: intentId,
    run_id: p.storm.run_id,
    storm_id: p.storm.storm_id,
    event_id: p.event.event_id,
    policy_mint: p.policyMint,
    owner: p.owner,
    gauge_id: p.event.gauge_id,
    kind: p.kind,
    amount: p.amount,
    tx_sig: sig,
    last_valid_block_height: String(lastValidBlockHeight),
  });
  if (!recorded) return; // another attempt is already in flight

  try {
    await connection.sendRawTransaction(tx.serialize());
    await dbq.setIntentStatus(intentId, "sent");
    const res = await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
    if (res.value.err) throw new Error(JSON.stringify(res.value.err));
    const intent = await dbq.getIntent(intentId);
    if (intent) await finalize(intent);
  } catch (err) {
    // Leave it to recoverIntents: it decides confirmed / expired from chain state.
    console.warn(`  ${p.kind} for ${p.policyMint.slice(0, 8)} not confirmed yet: ${String(err).slice(0, 160)}`);
  }
}

const warned = new Set<string>();
function warnOnce(key: string, msg: string) {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(msg);
}

async function processStorm(storm: dbq.Storm): Promise<void> {
  if (storm.f_int == null) return warnOnce(`fint:${storm.storm_id}`, `storm ${storm.storm_id}: waiting for f_int from the engine`);
  const fInt = storm.f_int;
  const events = await dbq.stormEvents(storm.storm_id);
  const byEvent = new Map(events.map((e) => [e.event_id, e]));
  type Todo = { kind: PayoutKind; event: dbq.GaugeEvent; mint: string; owner: string; gaugeId: string; amount: number };
  const todo: Todo[] = [];

  // Interim: every ACTV policy on a gauge whose event is in this storm.
  for (const event of events) {
    if (sha256Hex(event.preimage) !== event.evidence_hash) {
      warnOnce(`hash:${event.event_id}`, `event ${event.event_id}: evidence_hash != sha256(preimage); not paying`);
      continue;
    }
    for (const p of await dbq.interimCandidates(event.gauge_id, new Date(event.opened_at), storm.storm_id)) {
      todo.push({ kind: "interim", event, mint: p.policy_mint, owner: p.owner, gaugeId: p.gauge_id, amount: round6(fInt * p.payout_usd) });
    }
  }

  // True-up: once the engine has closed the storm and set f_fin.
  const closed = storm.status === "closed" && storm.f_fin != null;
  const interims = await dbq.intentsForStorm(storm.storm_id, "interim");
  const trueups = await dbq.intentsForStorm(storm.storm_id, "trueup");
  const delta = closed ? storm.f_fin! - fInt : 0;
  if (closed && delta > 0) {
    for (const i of interims.filter((x) => x.status === "confirmed")) {
      if (trueups.some((t) => t.policy_mint === i.policy_mint && t.status !== "expired")) continue;
      const benefit = i.amount / fInt;
      todo.push({ kind: "trueup", event: byEvent.get(i.event_id)!, mint: i.policy_mint, owner: i.owner, gaugeId: i.gauge_id, amount: round6(delta * benefit) });
    }
  }

  if (closed && !todo.length) {
    const settled = interims.every((i) => i.status === "confirmed") && trueups.every((t) => t.status === "confirmed");
    if (settled) {
      await dbq.markStormTruedUp(storm.storm_id);
      console.log(`storm ${storm.storm_id}: closed and trued up (f_int ${fInt}, f_fin ${storm.f_fin})`);
    }
    return;
  }
  if (!todo.length) return;

  const needed = toUnits(todo.reduce((s, t) => s + t.amount, 0));
  const have = await floatUnits();
  if (have < needed) {
    return warnOnce(
      `float:${storm.storm_id}:${needed}`,
      `storm ${storm.storm_id}: needs ${fromUnits(needed)} aUSD, float holds ${fromUnits(have)}. ` +
        "Refill with /chain/reset or npm run fund:bot; retrying quietly.",
    );
  }

  for (const t of todo) {
    if (t.kind === "interim") {
      // On-chain cross-check before the first payment (plan v3 8.5 step 2).
      const onchain = await readPolicy(connection, new PublicKey(t.mint));
      if (onchain.holder !== t.owner || onchain.fields.status !== "ACTV" || onchain.fields.gauge_id !== t.gaugeId) {
        warnOnce(
          `xcheck:${t.mint}:${storm.storm_id}`,
          `  skip ${t.mint}: on-chain holder=${onchain.holder} status=${onchain.fields.status} gauge=${onchain.fields.gauge_id}`,
        );
        continue;
      }
    }
    console.log(`storm ${storm.storm_id} ${t.kind}: ${t.amount} aUSD to ${t.owner} (${t.event.gauge_name ?? t.event.gauge_id})`);
    await pay({ kind: t.kind, storm, event: t.event, policyMint: t.mint, owner: t.owner, amount: t.amount });
  }
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

let running = false;
let lastError = "";
async function tick(): Promise<void> {
  if (running) return;
  running = true;
  try {
    await recoverIntents();
    for (const storm of await dbq.stormsToProcess()) await processStorm(storm);
    if (lastError) console.log("bot recovered");
    lastError = "";
  } catch (err) {
    // Log each distinct failure once (e.g. database down), not every poll.
    const msg = String((err as Error).message ?? err);
    if (msg !== lastError) console.error("bot tick failed (retrying quietly):", err);
    lastError = msg;
  } finally {
    running = false;
  }
}

console.log(`payout bot ${bot.publicKey.toBase58()} polling every ${env.botPollMs} ms`);
await tick();
setInterval(() => void tick(), env.botPollMs);
