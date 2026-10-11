// Start the engine (FastAPI) with whichever Python is installed: `npm run engine`, and the
// engine part of `npm run stack`. Windows usually has `py` or `python`, not `python3`.
// Set PYTHON in .env to force one (e.g. PYTHON=C:\Python312\python.exe).
import { spawn, spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { REPO_DIR, env } from "../env.js";

const candidates = [
  ...(process.env.PYTHON ? [process.env.PYTHON] : []),
  ...(process.platform === "win32" ? ["py", "python", "python3"] : ["python3", "python"]),
];
// The first one that can import what the engine needs.
const python = candidates.find(
  (cmd) => spawnSync(cmd, ["-c", "import uvicorn, fastapi, psycopg, psycopg_pool, httpx, dotenv"], { stdio: "ignore" }).status === 0,
);
if (!python) {
  console.error(
    `No Python with the engine's packages found (tried ${candidates.join(", ")}).\n` +
      `Install Python 3.11+ from python.org, then from the repo folder run:\n` +
      (process.platform === "win32" ? "  py -m pip install -r engine/requirements.txt" : "  python3 -m pip install -r engine/requirements.txt"),
  );
  process.exit(1);
}

const port = new URL(env.engineUrl).port || "8000";
console.log(`engine: ${python} -m uvicorn app.main:app on 127.0.0.1:${port}`);
const child = spawn(python, ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", port], {
  cwd: resolve(REPO_DIR, "engine"),
  stdio: "inherit",
});
for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => child.kill(sig));
child.on("exit", (code) => process.exit(code ?? 1));
