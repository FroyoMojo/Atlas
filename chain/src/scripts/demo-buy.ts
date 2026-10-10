// Buy a policy as a demo holder through the running chain server, exactly as a wallet would.
//   npm run demo:buy -- <gaugeId> [holder1|holder2|holder3] [serverUrl]
import { Transaction } from "@solana/web3.js";
import { KeyName, connection, env, explorer, loadKeypair } from "../env.js";

const [gauge, holderName = "holder1", server = `http://localhost:${env.port}`] = process.argv.slice(2);
if (!gauge) throw new Error("usage: npm run demo:buy -- <gaugeId> [holder] [serverUrl]");
const holder = loadKeypair(holderName as KeyName);
const res = await fetch(`${server}/api/actions/buy?gauge=${encodeURIComponent(gauge)}`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ account: holder.publicKey.toBase58() }),
});
const body = (await res.json()) as { transaction?: string; message?: string; policy_mint?: string };
if (!res.ok || !body.transaction) throw new Error(`server said ${res.status}: ${body.message}`);
const tx = Transaction.from(Buffer.from(body.transaction, "base64"));
tx.partialSign(holder);
const sig = await connection.sendRawTransaction(tx.serialize());
await connection.confirmTransaction(sig, "confirmed");
console.log(body.message);
console.log(`policy ${body.policy_mint}  ${explorer(sig)}`);
