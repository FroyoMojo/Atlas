// Pre-create unminted policy mints so a purchase never has to create one (plan 8.2).
//   npm run precreate -- <gaugeId>[,<gaugeId>...] [countPerGauge=10] [--no-delegate]
import { closeDb, insertPoolMint, poolCounts } from "../db.js";
import { connection, env, explorer, loadKeypair } from "../env.js";
import { planPolicyMint, termsHash } from "../lib/policy.js";
import { sendIxs } from "../lib/tx.js";

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (!args[0]) throw new Error("usage: npm run precreate -- <gaugeId>[,<gaugeId>...] [countPerGauge]");
const gauges = args[0].split(",");
const count = Number(args[1] ?? 10);
const permanentDelegate = !process.argv.includes("--no-delegate");
const payer = loadKeypair("issuer");

for (const gaugeId of gauges) {
  for (let i = 0; i < count; i++) {
    const policyId = `${gaugeId}-${Date.now().toString(36)}${i}`;
    const plan = await planPolicyMint(connection, payer.publicKey, payer.publicKey,
      { policyId, gaugeId, termsHash: termsHash(gaugeId), uri: `${env.publicBaseUrl}/terms/${policyId}.json` },
      { permanentDelegate });
    const sig = await sendIxs(connection, plan.instructions, [payer, plan.mint]);
    await insertPoolMint({ policyMint: plan.mint.publicKey.toBase58(), policyId, gaugeId, termsHash: termsHash(gaugeId) });
    console.log(`${gaugeId} ${policyId} ${plan.mint.publicKey.toBase58()}  ${explorer(sig)}`);
  }
}
console.table(await poolCounts());
await closeDb();
process.exit(0); // web3 confirmation websockets keep the event loop alive on provider RPCs
