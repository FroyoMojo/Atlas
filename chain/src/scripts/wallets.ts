// Show every demo wallet by audience with its SOL and aUSD balance, and print the DEMO_WALLETS line
// for .env. Extra addresses (sponsor and judge phones) are passed as arguments, each as
// `<address>` or `<address>:sponsor|household|investor`.
//   npm run wallets -- <phoneAddress>:sponsor <otherPhone>:household
import { getAccount } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { KeyName, connection, env, loadKeypair, requireState } from "../env.js";
import { ausdAta, fromUnits } from "../lib/ausd.js";

type Role = "household" | "sponsor" | "investor";
const ausdMint = requireState("ausdMint");

const rows: { role: Role; name: string; address: PublicKey }[] = [
  ...(["holder1", "holder2", "holder3"] as KeyName[]).map((n) => ({ role: "household" as Role, name: n, address: loadKeypair(n).publicKey })),
  { role: "investor", name: "investor", address: loadKeypair("investor").publicKey },
  ...process.argv.slice(2).map((a) => {
    const [addr, role = "sponsor"] = a.split(":");
    if (!["household", "sponsor", "investor"].includes(role)) throw new Error(`role in ${a} must be household, sponsor or investor`);
    return { role: role as Role, name: "extra", address: new PublicKey(addr) };
  }),
];

for (const r of rows) {
  const sol = (await connection.getBalance(r.address)) / 1e9;
  const ausd = await getAccount(connection, ausdAta(ausdMint, r.address)).then((a) => fromUnits(a.amount)).catch(() => 0);
  const flag = ausd <= 0 || sol < 0.01 ? "  <- needs funding (npm run fund)" : "";
  console.log(`${r.role.padEnd(10)} ${r.name.padEnd(9)} ${r.address.toBase58()}  SOL ${sol.toFixed(3)}  aUSD ${ausd}${flag}`);
}

const line = rows.map((r) => r.address.toBase58()).join(",");
const allowed = new Set(env.demoWallets);
const missing = rows.filter((r) => !allowed.has(r.address.toBase58()));
console.log(`\nDEMO_WALLETS=${line}`);
console.log(env.demoWallets.length === 0
  ? "\nDEMO_WALLETS is empty on this machine: the server accepts any wallet."
  : missing.length ? `\nNot on this machine's allowlist yet: ${missing.map((m) => `${m.role}/${m.name}`).join(", ")}` : "\nAll of these are on the allowlist.");
process.exit(0);
