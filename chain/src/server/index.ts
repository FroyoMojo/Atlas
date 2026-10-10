// Chain API: Solana Actions (Blink / Solana Pay / Buy button), bond deposits, policies,
// and the demo reset hook. Runs next to the engine on the Vultr box.
import { PublicKey } from "@solana/web3.js";
import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
import * as dbq from "../db.js";
import { getNavPerUnit, getQuote } from "../engine.js";
import { connection, env, explorer, loadKeypair, requireState } from "../env.js";
import { toUnits } from "../lib/ausd.js";
import { buildBondDepositTx } from "../lib/bond.js";
import { buildPurchaseTx, readPolicy, setPolicyStatusIx } from "../lib/policy.js";
import { sendIxs, serializeForWallet } from "../lib/tx.js";

// Solana devnet genesis hash, as Actions expects in X-Blockchain-Ids.
const DEVNET_CHAIN_ID = "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1";
const ACTIONS_VERSION = "2.4";

const app = express();
app.use(express.json());

// Actions spec CORS: every Action route must answer OPTIONS and expose these headers. [VERIFY on dial.to]
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "Content-Encoding",
      "Accept-Encoding",
      "X-Accept-Action-Version",
      "X-Accept-Blockchain-Ids",
    ],
    exposedHeaders: ["X-Action-Version", "X-Blockchain-Ids"],
  }),
);
app.use((_req, res, next) => {
  res.setHeader("X-Action-Version", ACTIONS_VERSION);
  res.setHeader("X-Blockchain-Ids", DEVNET_CHAIN_ID);
  next();
});

const wrap =
  (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

function parseAccount(value: unknown): PublicKey {
  try {
    return new PublicKey(String(value));
  } catch {
    throw Object.assign(new Error("Invalid account"), { status: 400 });
  }
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, demoMode: env.demoMode });
});

// Action icon (Blinks require an absolute image URL).
app.get("/icon.svg", (_req, res) => {
  res.type("image/svg+xml").send(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#1f4e79"/>` +
      `<path d="M0 360 Q128 300 256 360 T512 360 V512 H0Z" fill="#4aa3df"/>` +
      `<text x="256" y="250" font-family="Arial" font-size="150" font-weight="700" fill="#fff" text-anchor="middle">Atlas</text></svg>`,
  );
});

// Served at the domain root on the hosted site (proxy /actions.json to this route).
app.get("/actions.json", (_req, res) => {
  res.json({ rules: [{ pathPattern: "/api/actions/**", apiPath: "/api/actions/**" }] });
});

// ---------- buy a policy ----------

app.get(
  "/api/actions/buy",
  wrap(async (req, res) => {
    const gauge = String(req.query.gauge ?? "");
    const payout = Number(req.query.payout ?? env.defaultPayout);
    const quote = await getQuote(gauge, payout);
    res.json({
      type: "action",
      icon: `${env.publicBaseUrl}/icon.svg`,
      title: `Atlas flood cover: gauge ${gauge}`,
      description:
        `Pays ${payout} aUSD if this gauge crosses its flood trigger during the term. ` +
        `Premium ${quote.premium.toFixed(2)} aUSD. Fixed payout for immediate needs; not property insurance. Devnet only.`,
      label: `Buy for ${quote.premium.toFixed(2)} aUSD`,
      disabled: !quote.sales_open,
      ...(quote.sales_open ? {} : { error: { message: quote.reason ?? "Sales are closed for this gauge" } }),
      links: {
        actions: [
          {
            type: "transaction",
            label: `Buy for ${quote.premium.toFixed(2)} aUSD`,
            href: `/api/actions/buy?gauge=${encodeURIComponent(gauge)}&payout=${payout}`,
          },
        ],
      },
    });
  }),
);

app.post(
  "/api/actions/buy",
  wrap(async (req, res) => {
    const gauge = String(req.query.gauge ?? "");
    const payout = Number(req.query.payout ?? env.defaultPayout);
    const buyer = parseAccount(req.body?.account);
    const quote = await getQuote(gauge, payout);
    if (!quote.sales_open) {
      res.status(403).json({ message: quote.reason ?? "Sales are closed for this gauge" });
      return;
    }
    const reservation = await dbq.reservePolicyMint(gauge, buyer.toBase58(), quote.premium, payout);
    if (!reservation) {
      res.status(409).json({ message: `No policies left for gauge ${gauge}. Run npm run precreate.` });
      return;
    }
    const tx = await buildPurchaseTx({
      connection,
      buyer,
      policyMint: new PublicKey(reservation.policyMint),
      policyId: reservation.policyId,
      issuer: loadKeypair("issuer"),
      ausdMint: requireState("ausdMint"),
      vault: requireState("vault"),
      premiumUnits: toUnits(quote.premium),
    });
    res.json({
      type: "transaction",
      transaction: serializeForWallet(tx),
      message: `Atlas policy ${reservation.policyId} on gauge ${gauge}: ${quote.premium.toFixed(2)} aUSD premium, ${payout} aUSD payout.`,
      policy_mint: reservation.policyMint,
    });
  }),
);

// ---------- bond deposit ----------

app.post(
  "/api/bond/deposit",
  wrap(async (req, res) => {
    const investor = parseAccount(req.body?.account);
    const amount = Number(req.body?.amount);
    if (!(amount > 0)) {
      res.status(400).json({ message: "amount must be a positive number of aUSD" });
      return;
    }
    const navPerUnit = await getNavPerUnit();
    const tx = await buildBondDepositTx({
      connection,
      investor,
      issuer: loadKeypair("issuer"),
      ausdMint: requireState("ausdMint"),
      bondMint: requireState("bondMint"),
      vault: requireState("vault"),
      depositUnits: toUnits(amount),
      navPerUnit,
    });
    res.json({ type: "transaction", transaction: serializeForWallet(tx), nav_per_unit: navPerUnit });
  }),
);

// ---------- policies ----------

app.get(
  "/policies",
  wrap(async (req, res) => {
    const owner = parseAccount(req.query.owner).toBase58();
    res.json(await dbq.policiesByOwner(owner));
  }),
);

app.get(
  "/policies/:mint/onchain",
  wrap(async (req, res) => {
    const policy = await readPolicy(connection, parseAccount(req.params.mint));
    res.json({ ...policy, supply: policy.supply.toString(), explorer: explorer(policy.mint, "address") });
  }),
);

// Public terms JSON that each policy's metadata `uri` points at.
app.get(
  "/terms/:policyId.json",
  wrap(async (req, res) => {
    const row = await dbq.poolRow(String(req.params.policyId));
    if (!row) {
      res.status(404).json({ message: "Unknown policy" });
      return;
    }
    res.json({
      policy_id: row.policy_id,
      gauge_id: row.gauge_id,
      payout_aUSD: row.payout_usd ?? env.defaultPayout,
      premium_aUSD: row.premium_usd,
      term_days: 365,
      trigger: "Two consecutive gauge readings at or above the gauge's trigger level",
      one_payout_per_term: true,
      covers: "Immediate needs only. Not property insurance. Devnet test product.",
      terms_hash: row.terms_hash,
    });
  }),
);

// ---------- demo reset (called by the engine's POST /replay/reset) ----------

app.post(
  "/internal/demo/reset-policies",
  wrap(async (req, res) => {
    if (!env.internalToken || req.header("x-internal-token") !== env.internalToken) {
      res.status(401).json({ message: "bad internal token" });
      return;
    }
    const issuer = loadKeypair("issuer");
    const rows = await dbq.demoPolicies();
    const reset: string[] = [];
    // Batch a few metadata updates per transaction.
    for (let i = 0; i < rows.length; i += 6) {
      const batch = rows.slice(i, i + 6);
      await sendIxs(
        connection,
        batch.map((r) => setPolicyStatusIx(new PublicKey(r.policy_mint), issuer.publicKey, "active")),
        [issuer],
      );
      for (const r of batch) {
        await dbq.setPolicyStatusDb(r.policy_mint, "active");
        reset.push(r.policy_mint);
      }
    }
    res.json({ ok: true, reset });
  }),
);

app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(err.status ?? 500).json({ message: err.message });
});

// ---------- confirmer: turns confirmed purchases into policies rows ----------

async function confirmPurchases(): Promise<void> {
  for (const row of await dbq.reservedMints()) {
    try {
      const policy = await readPolicy(connection, new PublicKey(row.policy_mint));
      if (policy.supply === 1n && policy.holder) {
        await dbq.markSold({
          policyMint: row.policy_mint,
          owner: policy.holder,
          gaugeId: row.gauge_id,
          premiumUsd: row.premium_usd,
          payoutUsd: row.payout_usd,
          waitingDays: env.demoMode ? 0 : 7,
          demo: env.demoMode,
        });
        console.log(`sold ${row.policy_id} (${row.policy_mint}) to ${policy.holder}`);
      }
    } catch (err) {
      console.warn(`confirmer: ${row.policy_mint}: ${String(err)}`);
    }
  }
}

setInterval(() => void confirmPurchases().catch((e) => console.warn("confirmer", e)), 4_000);

app.listen(env.port, () => {
  console.log(`atlas chain server on :${env.port} (demo mode ${env.demoMode ? "on" : "off"})`);
});
