// Preflight: one command that says whether the demo laptop is ready, before G3 and before judging.
//   npm run preflight            (with `npm run stack` running for the service checks)
// Prints PASS / WARN / FAIL per check and exits 1 if anything failed. Changes nothing: no
// transactions, no database writes, no Start or Reset.
import { getAccount } from "@solana/spl-token";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { closeDb, db } from "../db.js";
import { KEY_NAMES, REPO_DIR, connection, env, loadKeypair, loadState } from "../env.js";
import { AUSD_PROGRAM_ID, ausdAta, fromUnits } from "../lib/ausd.js";

type Level = "PASS" | "WARN" | "FAIL";
const results: { level: Level; name: string; detail: string }[] = [];
const report = (level: Level, name: string, detail = "") => {
  results.push({ level, name, detail });
  const mark = level === "PASS" ? "✓" : level === "WARN" ? "!" : "✗";
  console.log(`${mark} ${level.padEnd(4)} ${name}${detail ? `: ${detail}` : ""}`);
};
async function check(name: string, fn: () => Promise<[Level, string] | Level | void>) {
  try {
    const r = await fn();
    if (Array.isArray(r)) report(r[0], name, r[1]);
    else report(r ?? "PASS", name);
  } catch (err) {
    report("FAIL", name, String((err as Error).message ?? err).slice(0, 200));
  }
}
const DEVNET_GENESIS = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
const isLocal = (url: string) => /example\.com|localhost|127\.0\.0\.1/.test(url);
const GATEWAY = `http://127.0.0.1:${process.env.GATEWAY_PORT ?? 8080}`;
const CHAIN = `http://127.0.0.1:${env.port}`;
async function get(url: string, init?: RequestInit) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
  return { status: res.status, body: (await res.json().catch(() => null)) as any };
}

console.log("== configuration");
await check("SOLANA_RPC_URL is a provider URL", async () =>
  /api\.devnet\.solana\.com/.test(env.rpcUrl) ? ["WARN", "public devnet RPC returns 429s under load; use the Helius URL"] : "PASS");
await check("DATABASE_URL set", async () => (env.databaseUrl ? "PASS" : ["FAIL", "missing"]));
await check("ADMIN_TOKEN set (16+ characters)", async () =>
  env.adminToken.length >= 16 ? "PASS" : ["FAIL", env.adminToken ? "too short" : "missing"]);
await check("PUBLIC_BASE_URL is public", async () =>
  isLocal(env.publicBaseUrl) ? ["WARN", `${env.publicBaseUrl}: set the tunnel URL or domain (used in policy metadata)`] : ["PASS", env.publicBaseUrl]);
await check("DEMO_WALLETS allowlist", async () =>
  env.demoWallets.length ? ["PASS", `${env.demoWallets.length} wallets`] : ["WARN", "empty: anyone can buy on the public URL"]);
await check("policy term", async () =>
  env.termDays >= 30 ? ["PASS", `${env.termDays} days`] : ["FAIL", `TERM_DAYS=${env.termDays}: must be at least 30 so the replay stays inside the term`]);
await check("FORCE_F_INT not set", async () =>
  process.env.FORCE_F_INT ? ["WARN", `FORCE_F_INT=${process.env.FORCE_F_INT}: true-up rehearsal only`] : "PASS");

console.log("== keys and devnet");
await check("keypairs in secrets/", async () => {
  const missing = KEY_NAMES.filter((k) => {
    try {
      loadKeypair(k);
      return false;
    } catch {
      return true;
    }
  });
  if (missing.some((k) => ["treasury", "issuer", "bot"].includes(k))) return ["FAIL", `missing ${missing.join(", ")}`];
  return missing.length ? ["WARN", `missing ${missing.join(", ")}`] : ["PASS", `all ${KEY_NAMES.length}`];
});
const state = loadState();
await check("chain/state/devnet.json addresses", async () => {
  const need = ["ausdMint", "vault", "multisig", "bondMint"] as const;
  const missing = need.filter((k) => !state[k]);
  return missing.length ? ["FAIL", `missing ${missing.join(", ")}`] : "PASS";
});
await check("RPC answers and is devnet", async () => {
  const genesis = await connection.getGenesisHash();
  return genesis === DEVNET_GENESIS ? "PASS" : ["FAIL", `genesis ${genesis} is not devnet`];
});
for (const [name, min] of [["treasury", 0.2], ["issuer", 0.1], ["bot", 0.05]] as const) {
  await check(`${name} SOL for fees`, async () => {
    const sol = (await connection.getBalance(loadKeypair(name).publicKey)) / LAMPORTS_PER_SOL;
    return sol >= min ? ["PASS", `${sol.toFixed(3)} SOL`] : ["WARN", `${sol.toFixed(3)} SOL, top up above ${min}`];
  });
}
await check("vault and float aUSD", async () => {
  const mint = new PublicKey(state.ausdMint!);
  const bal = async (owner: PublicKey, offCurve = false) => {
    try {
      return fromUnits((await getAccount(connection, ausdAta(mint, owner, offCurve), "confirmed", AUSD_PROGRAM_ID)).amount);
    } catch {
      return 0;
    }
  };
  const vault = await bal(new PublicKey(state.vault!), true);
  const float = await bal(loadKeypair("bot").publicKey);
  const detail = `vault ${vault}, float ${float}`;
  return float >= env.defaultPayout && vault >= env.snapshotVault * 0.5 ? ["PASS", detail] : ["WARN", `${detail}: press Reset to refill`];
});

console.log("== database");
await check("engine and chain tables", async () => {
  const need = ["gauges", "gauge_readings", "annual_peaks", "runs", "storms", "gauge_events", "replay_alerts",
    "policies", "sim_policies", "ledger", "gauge_hourly", "gauge_rates", "policy_pool", "payout_intents"];
  const { rows } = await db().query(`SELECT t, to_regclass(t) IS NOT NULL AS ok FROM unnest($1::text[]) AS t`, [need]);
  const missing = rows.filter((r) => !r.ok).map((r) => r.t);
  if (missing.length) return ["FAIL", `missing ${missing.join(", ")}: run engine/sql/schema.sql and npm run migrate`];
  const cols = ["reset_wall", "opening_vault", "opening_float"];
  const col = await db().query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'runs' AND column_name = ANY($1)`,
    [cols],
  );
  const have = new Set(col.rows.map((r: { column_name: string }) => r.column_name));
  const gone = cols.filter((c) => !have.has(c));
  return gone.length ? ["FAIL", `runs is missing ${gone.join(", ")}: run npm run migrate`] : "PASS";
});
const demo = await db()
  .query(`SELECT gauge_id, name, trigger_ft FROM gauges WHERE demo_ready ORDER BY gauge_id`)
  .then((r) => r.rows as { gauge_id: string; name: string; trigger_ft: number }[])
  .catch(() => []);
await check("demo gauges", async () =>
  demo.length === 4 ? ["PASS", demo.map((g) => g.gauge_id).join(", ")] : [demo.length ? "WARN" : "FAIL", `${demo.length} demo_ready gauges (plan: 4)`]);
for (const g of demo) {
  await check(`gauge ${g.gauge_id} (${g.name})`, async () => {
    const { rows } = await db().query(
      `SELECT (SELECT count(*)::int FROM policy_pool WHERE gauge_id = $1 AND status = 'free') AS free,
              (SELECT count(*)::int FROM annual_peaks p JOIN gauges g USING (gauge_id)
                 WHERE p.gauge_id = $1 AND p.peak_stage_ft IS NOT NULL
                   AND (g.record_start IS NULL OR p.water_year >= g.record_start)) AS peaks,
              (SELECT count(*)::int FROM gauge_rates r WHERE r.gauge_id = $1
                 AND (r.trigger_ft IS NULL OR r.trigger_ft = $2)) AS rates,
              (SELECT count(*)::int FROM gauge_readings WHERE gauge_id = $1 AND run_id = 'live'
                 AND event_time BETWEEN '2017-08-23' AND '2017-09-05' AND stage_ft >= $2) AS above`,
      [g.gauge_id, g.trigger_ft],
    );
    const r = rows[0];
    const problems = [
      r.free < 3 && `${r.free} free policy mints (npm run precreate)`,
      r.peaks < 10 && `${r.peaks} comparable annual peaks`,
      r.rates === 0 && "no gauge_rates counts at this trigger (python data/event_rate.py --store): priced on peaks only",
      r.above < 2 && "no Harvey readings above trigger",
    ].filter(Boolean);
    const detail = `${r.free} free mints, ${r.peaks} comparable peak years, ${r.above} Harvey readings above trigger`;
    return problems.length ? [r.free === 0 || r.above < 2 ? "FAIL" : "WARN", problems.join("; ")] : ["PASS", detail];
  });
}
await check("simulated book", async () => {
  const { rows } = await db().query(`SELECT count(*)::int AS n FROM sim_policies`);
  return rows[0].n ? ["PASS", `${rows[0].n} policies`] : ["WARN", "sim_policies empty: pool page shows 0 for the simulated book"];
});

console.log("== services (npm run stack)");
await check("engine", async () => {
  const r = await get(`${env.engineUrl}/health`);
  return r.status === 200 ? "PASS" : ["FAIL", `HTTP ${r.status}`];
});
await check("engine accepts ADMIN_TOKEN", async () => {
  const r = await get(`${env.engineUrl}/admin/check`, { headers: { "X-Admin-Token": env.adminToken } });
  return r.status === 200 ? "PASS" : ["FAIL", `HTTP ${r.status}: engine and chain must share one ADMIN_TOKEN`];
});
await check("chain service", async () => {
  const r = await get(`${CHAIN}/health`);
  return r.status === 200 ? ["PASS", `purchase flow ${r.body?.purchaseFlow}`] : ["FAIL", `HTTP ${r.status}`];
});
await check("chain balances", async () => {
  const r = await get(`${CHAIN}/chain/balances`);
  return r.status === 200 ? "PASS" : ["FAIL", r.body?.message ?? `HTTP ${r.status}`];
});
await check("gateway: dashboard, engine and chain routes", async () => {
  const [page, eng, ch] = await Promise.all([
    fetch(`${GATEWAY}/`, { signal: AbortSignal.timeout(10_000) }).then((r) => r.status),
    get(`${GATEWAY}/engine/health`).then((r) => r.status),
    get(`${GATEWAY}/health`).then((r) => r.status),
  ]);
  return page === 200 && eng === 200 && ch === 200 ? "PASS" : ["FAIL", `dashboard ${page}, /engine ${eng}, chain ${ch}`];
});
await check("gateway refuses /chain/reset", async () => {
  const r = await get(`${GATEWAY}/chain/reset`, { method: "POST" });
  return r.status === 403 ? "PASS" : ["FAIL", `HTTP ${r.status}: reset must not be reachable through the tunnel`];
});
for (const g of demo) {
  await check(`quote ${g.gauge_id}`, async () => {
    const r = await get(`${env.engineUrl}/quote?gauge=${encodeURIComponent(g.gauge_id)}&payout=${env.defaultPayout}`);
    if (r.status !== 200) return ["FAIL", r.body?.detail ?? `HTTP ${r.status}`];
    const q = r.body;
    if (q.term_days != null && Math.abs(q.term_days - env.termDays) > 0.5) {
      return ["FAIL", `engine prices a ${q.term_days}-day term, chain sells ${env.termDays} days: set one TERM_DAYS (and drop TERM_YEARS)`];
    }
    return q.sales_open ? ["PASS", `premium ${q.premium} aUSD, P ${(q.p_payout * 100).toFixed(1)}%`] : ["WARN", `sales closed: ${q.reason}`];
  });
}
await check("reconciliation", async () => {
  const r = await get(`${env.engineUrl}/pool`);
  if (r.status !== 200) return ["FAIL", `HTTP ${r.status}`];
  return r.body.onchain.reconciled ? "PASS" : ["WARN", `not reconciled: ${JSON.stringify(r.body.onchain.reconcile_detail)}; press Reset`];
});

console.log("== hosted build and public URL");
await check("dashboard build", async () => {
  const dist = resolve(REPO_DIR, "web/dist");
  if (!existsSync(resolve(dist, "index.html"))) return ["FAIL", "no web/dist: npm run web:build"];
  const js = readdirSync(resolve(dist, "assets")).filter((f) => f.endsWith(".js"));
  const text = js.map((f) => readFileSync(resolve(dist, "assets", f), "utf8")).join("");
  if (/localhost:8787|localhost:8000|127\.0\.0\.1:8899/.test(text)) return ["FAIL", "bundle has localhost URLs: npm run web:build"];
  if (/api-key=/.test(text)) return ["FAIL", "bundle contains an RPC API key"];
  if (state.ausdMint && !text.includes(state.ausdMint)) return ["FAIL", "bundle has a different aUSD mint: npm run web:build"];
  return "PASS";
});
await check("public URL", async () => {
  if (isLocal(env.publicBaseUrl)) return ["WARN", "PUBLIC_BASE_URL is not a public URL yet"];
  const [health, reset] = await Promise.all([
    get(`${env.publicBaseUrl}/health`).then((r) => r.status),
    get(`${env.publicBaseUrl}/chain/reset`, { method: "POST" }).then((r) => r.status),
  ]);
  if (reset !== 403) return ["FAIL", `${env.publicBaseUrl}/chain/reset gave ${reset}, expected 403`];
  return health === 200 ? ["PASS", env.publicBaseUrl] : ["FAIL", `${env.publicBaseUrl}/health gave ${health}`];
});

await closeDb().catch(() => undefined);
const fails = results.filter((r) => r.level === "FAIL").length;
const warns = results.filter((r) => r.level === "WARN").length;
console.log(`\n${fails ? "NOT READY" : "READY"}: ${results.length - fails - warns} pass, ${warns} warn, ${fails} fail`);
process.exit(fails ? 1 : 0); // web3 confirmation websockets keep the event loop alive on provider RPCs
