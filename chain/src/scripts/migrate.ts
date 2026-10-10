// Apply chain-side tables. Pass --dev-stub to also create local copies of the engine tables
// (local Postgres only, never the shared Tiger database).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { closeDb, db } from "../db.js";
import { CHAIN_DIR } from "../env.js";

const files = [...(process.argv.includes("--dev-stub") ? ["dev_engine_stub.sql"] : []), "001_chain_tables.sql"];
for (const f of files) {
  await db().query(readFileSync(resolve(CHAIN_DIR, "sql", f), "utf8"));
  console.log(`applied ${f}`);
}
await closeDb();
