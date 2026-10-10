// Deposit aUSD into the catastrophe bond as the demo investor, through the running chain server.
//   npm run demo:bond -- [amountAUSD=5000] [serverUrl]
import { Transaction } from "@solana/web3.js";
import { connection, env, explorer, loadKeypair } from "../env.js";

const [amount = "5000", server = `http://localhost:${env.port}`] = process.argv.slice(2);
const investor = loadKeypair("investor");
const res = await fetch(`${server}/api/bond/deposit`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ account: investor.publicKey.toBase58(), amount: Number(amount) }),
});
const body = (await res.json()) as { transaction?: string; message?: string; nav_per_unit?: number };
if (!res.ok || !body.transaction) throw new Error(`server said ${res.status}: ${body.message}`);
const tx = Transaction.from(Buffer.from(body.transaction, "base64"));
tx.partialSign(investor);
const sig = await connection.sendRawTransaction(tx.serialize());
await connection.confirmTransaction(sig, "confirmed");
console.log(`deposited ${amount} aUSD at NAV ${body.nav_per_unit}: ${explorer(sig)}`);
