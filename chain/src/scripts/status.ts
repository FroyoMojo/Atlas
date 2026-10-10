// Print every wallet's SOL and aUSD, plus the vault and bond supply.
import { getAccount, getMint } from "@solana/spl-token";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { KEY_NAMES, connection, env, loadKeypair, loadState } from "../env.js";
import { ausdAta, fromUnits } from "../lib/ausd.js";

const state = loadState();
console.log(`state file ${env.stateFile}`);
console.log(JSON.stringify(state, null, 2));
const ausd = state.ausdMint ? new PublicKey(state.ausdMint) : null;

async function ausdOf(owner: PublicKey, offCurve = false): Promise<number | string> {
  if (!ausd) return "-";
  try {
    return fromUnits((await getAccount(connection, ausdAta(ausd, owner, offCurve))).amount);
  } catch {
    return 0;
  }
}

const rows: Record<string, { address: string; SOL: number; aUSD: number | string }> = {};
for (const name of KEY_NAMES) {
  try {
    const pk = loadKeypair(name).publicKey;
    rows[name] = { address: pk.toBase58(), SOL: (await connection.getBalance(pk)) / LAMPORTS_PER_SOL, aUSD: await ausdOf(pk) };
  } catch {
    /* key not generated yet */
  }
}
if (state.vault) {
  const v = new PublicKey(state.vault);
  rows.vault = { address: v.toBase58(), SOL: (await connection.getBalance(v)) / LAMPORTS_PER_SOL, aUSD: await ausdOf(v, true) };
}
console.table(rows);
if (state.bondMint) {
  const m = await getMint(connection, new PublicKey(state.bondMint));
  console.log(`bond units outstanding: ${fromUnits(m.supply)}`);
}
