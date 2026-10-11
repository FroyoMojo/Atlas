// Gateway: one local port in front of everything. On Vultr, Caddy terminates HTTPS and proxies to
// it; on the fallback laptop, Cloudflare Tunnel does.
//   /engine/*       -> Ezekiel's FastAPI on 127.0.0.1:8000 (prefix stripped)
//   chain routes    -> chain service on 127.0.0.1:CHAIN_PORT
//   /chain/reset    -> 403 (admin reset is localhost-only, never through the tunnel)
//   everything else -> the built dashboard (web/dist), index.html fallback for hash routes
import express from "express";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { createProxyMiddleware } from "http-proxy-middleware";
import { REPO_DIR, env } from "../env.js";

const PORT = Number(process.env.GATEWAY_PORT ?? 8080);
const ENGINE = process.env.ENGINE_URL ?? "http://127.0.0.1:8000";
const CHAIN = `http://127.0.0.1:${env.port}`;
const DIST = resolve(REPO_DIR, "web/dist");

const app = express();
app.disable("x-powered-by");

app.all("/chain/reset", (_req, res) => {
  res.status(403).json({ message: "Localhost only" });
});

// xfwd adds X-Forwarded-For, so the chain service also treats these as remote requests.
app.use("/engine", createProxyMiddleware({ target: ENGINE, xfwd: true }));
app.use(
  createProxyMiddleware({
    target: CHAIN,
    xfwd: true,
    pathFilter: ["/api", "/policies", "/chain", "/terms", "/actions.json", "/icon.svg", "/health"],
  }),
);

if (!existsSync(resolve(DIST, "index.html"))) {
  console.warn(`No dashboard build at ${DIST}. Run: cd web && npm run build`);
}
app.use(express.static(DIST, { index: "index.html" }));
app.use((_req, res) => {
  res.sendFile(resolve(DIST, "index.html"));
});

app.listen(PORT, "127.0.0.1", () => {
  console.log(`atlas gateway on http://127.0.0.1:${PORT}  (engine ${ENGINE}, chain ${CHAIN})`);
  console.log(`expose it: cloudflared tunnel --url http://127.0.0.1:${PORT}`);
});
