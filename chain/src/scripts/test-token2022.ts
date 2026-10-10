// Hour-0 check (decisions.md #5 and #6): create a policy mint with every extension, sell it
// through the real purchase transaction, flip its status, and report transaction sizes.
//   npm run test:token2022 -- [--no-delegate]
import { Transaction } from "@solana/web3.js";
import { connection, explorer, loadKeypair, loadState } from "../env.js";
import { buildPurchaseTx, planPolicyMint, readPolicy, setPolicyStatusIxs, termsHash } from "../lib/policy.js";
import { priorityFeeIx, sendIxs } from "../lib/tx.js";
import { toUnits } from "../lib/ausd.js";
import { PublicKey } from "@solana/web3.js";

const permanentDelegate = !process.argv.includes("--no-delegate");
const payer = loadKeypair("treasury");
const issuer = loadKeypair("issuer");
const gaugeId = "TEST";
const policyId = `test-${Date.now().toString(36)}`;

const plan = await planPolicyMint(connection, payer.publicKey, issuer.publicKey,
  { policyId, gaugeId, termsHash: termsHash(gaugeId), uri: `https://example.com/terms/${policyId}.json` },
  { permanentDelegate });
const sizeTx = new Transaction().add(priorityFeeIx(), ...plan.instructions);
sizeTx.feePayer = payer.publicKey;
sizeTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
sizeTx.sign(payer, plan.mint, issuer);
console.log(`create-mint tx size: ${sizeTx.serialize().length} / 1232 bytes (PermanentDelegate ${permanentDelegate ? "on" : "off"})`);
const createSig = await sendIxs(connection, plan.instructions, [payer, plan.mint, issuer]);
console.log(`created ${plan.mint.publicKey.toBase58()}  ${explorer(createSig)}`);

const state = loadState();
if (state.ausdMint && state.vault) {
  const buyer = loadKeypair("holder1");
  const tx = await buildPurchaseTx({
    connection, buyer: buyer.publicKey, policyMint: plan.mint.publicKey, policyId, issuer: issuer.publicKey,
    ausdMint: new PublicKey(state.ausdMint), vault: new PublicKey(state.vault), premiumUnits: toUnits(1),
  });
  tx.partialSign(issuer, buyer);
  const raw = tx.serialize();
  console.log(`purchase tx size: ${raw.length} / 1232 bytes`);
  const sig = await connection.sendRawTransaction(raw);
  await connection.confirmTransaction(sig, "confirmed");
  console.log(`purchase (1 aUSD premium) ${explorer(sig)}`);
} else {
  console.log("skip purchase test: run setup:ausd, fund and setup:multisig first");
}

await sendIxs(connection, setPolicyStatusIxs(plan.mint.publicKey, issuer.publicKey, "PAID"), [issuer]);
const paid = await readPolicy(connection, plan.mint.publicKey, loadKeypair("holder1").publicKey);
console.log(`after PAID: name="${paid.name}" status=${paid.fields.status}`);
await sendIxs(connection, setPolicyStatusIxs(plan.mint.publicKey, issuer.publicKey, "ACTV"), [issuer]);
const p = await readPolicy(connection, plan.mint.publicKey, loadKeypair("holder1").publicKey);
console.log(`read back: name="${p.name}" supply=${p.supply} holder=${p.holder} fields=${JSON.stringify(p.fields)}`);
console.log("name + status ACTV -> PAID -> ACTV round trip OK");
