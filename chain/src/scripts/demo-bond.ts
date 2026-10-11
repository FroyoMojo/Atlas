// Deposit aUSD into the catastrophe bond as the demo investor (wallet signs first, server co-signs).
//   npm run demo:bond -- [amountAUSD=5000] [serverUrl]
import { Transaction } from "@solana/web3.js";
import { env, explorer, loadKeypair } from "../env.js";

const [amount = "5000", server = `http://127.0.0.1:${env.port}`] = process.argv.slice(2);
const investor = loadKeypair("investor");
async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${server}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = (await res.json()) as T & { message?: string };
  if (!res.ok) throw new Error(`${path}: ${res.status} ${json.message}`);
  return json;
}
const built = await post<{ transaction: string; nav_per_unit: number }>("/api/bond/deposit", {
  account: investor.publicKey.toBase58(),
  amount: Number(amount),
});
const tx = Transaction.from(Buffer.from(built.transaction, "base64"));
tx.partialSign(investor);
const { signature } = await post<{ signature: string }>("/api/bond/submit", {
  transaction: tx.serialize({ requireAllSignatures: false }).toString("base64"),
});
console.log(`deposited ${amount} aUSD at NAV ${built.nav_per_unit}: ${explorer(signature)}`);
process.exit(0); // web3 confirmation websockets keep the event loop alive on provider RPCs
