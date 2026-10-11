// Buy a policy as a demo holder through the running chain service, exactly as a wallet would.
//   npm run demo:buy -- <gaugeId> [holder1|holder2|holder3] [a|b] [serverUrl]
// Flow a: server signs first, the wallet signs and sends. Flow b: wallet signs first, server
// co-signs and submits (plan v3 8.3).
import { Transaction } from "@solana/web3.js";
import { KeyName, connection, env, explorer, loadKeypair } from "../env.js";

const [gauge, holderName = "holder1", flow = env.purchaseFlow, server = `http://localhost:${env.port}`] = process.argv.slice(2);
if (!gauge) throw new Error("usage: npm run demo:buy -- <gaugeId> [holder] [a|b] [serverUrl]");
const holder = loadKeypair(holderName as KeyName);

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${server}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = (await res.json()) as T & { message?: string };
  if (!res.ok) throw new Error(`${path}: ${res.status} ${json.message}`);
  return json;
}

const built = await post<{ transaction: string; message: string; policy_mint: string }>(
  `/api/actions/buy?gauge=${encodeURIComponent(gauge)}&flow=${flow}`,
  { account: holder.publicKey.toBase58() },
);
const tx = Transaction.from(Buffer.from(built.transaction, "base64"));
tx.partialSign(holder);
let sig: string;
if (flow === "b") {
  ({ signature: sig } = await post<{ signature: string }>("/api/purchase/submit", {
    transaction: tx.serialize({ requireAllSignatures: false }).toString("base64"),
  }));
} else {
  sig = await connection.sendRawTransaction(tx.serialize());
  await connection.confirmTransaction(sig, "confirmed");
}
console.log(`flow ${flow.toUpperCase()}: ${built.message}`);
console.log(`policy ${built.policy_mint}  ${explorer(sig)}`);
process.exit(0); // web3 confirmation websockets keep the event loop alive on provider RPCs
