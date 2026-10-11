// Apply the database schema: the engine tables (engine/sql/schema.sql, TimescaleDB) and then the
// chain-side tables. Safe to run more than once. No psql needed, so it works the same on Windows.
//   npm run migrate              engine schema + chain tables (Tiger, or local TimescaleDB)
//   npm run migrate -- --chain   chain tables only
//   npm run migrate -- --dev-stub  plain-Postgres copies of the engine tables + chain tables
//                                  (local Postgres without TimescaleDB only, never on Tiger)
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { closeDb, db } from "../db.js";
import { CHAIN_DIR, REPO_DIR } from "../env.js";

/**
 * Split a SQL file into statements and run them one at a time, as psql does. Sending the file
 * as one query would run it in a single implicit transaction, and TimescaleDB refuses to create
 * a continuous aggregate or call a policy procedure inside a transaction block. The schema files
 * have no semicolons inside strings, and `--` comments are removed first.
 */
async function applyFile(path: string): Promise<number> {
  const sql = readFileSync(path, "utf8")
    .split(/\r?\n/)
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
  const statements = sql.split(";").map((s) => s.trim()).filter(Boolean);
  for (const st of statements) await db().query(st);
  return statements.length;
}

const args = process.argv.slice(2);
const files = args.includes("--dev-stub")
  ? [resolve(CHAIN_DIR, "sql", "dev_engine_stub.sql")]
  : args.includes("--chain")
    ? []
    : [resolve(REPO_DIR, "engine", "sql", "schema.sql")];
files.push(resolve(CHAIN_DIR, "sql", "001_chain_tables.sql"));

for (const f of files) {
  const n = await applyFile(f);
  console.log(`applied ${f.slice(REPO_DIR.length + 1)} (${n} statements)`);
}
await closeDb();
process.exit(0);
