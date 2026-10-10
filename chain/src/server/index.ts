// Chain service (plan v3 4.1, 8, 9): the only process besides the bot that holds signing keys.
// Purchase (Flow A or B), bond deposit, Solana Actions, policies, the chain side of reset, and
// balances for the engine's reconciliation. Python never builds or signs a transaction.
import { createMintToInstruction, getAccount, getMint } from "@solana/spl-token";
import { PublicKey, Transaction } from "@solana/web3.js";
import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
import * as dbq from "../db.js";
import { getNavPerUnit, getQuote } from "../engine.js";
import { connection, env, explorer, loadKeypair, requireState } from "../env.js";
import { AUSD_PROGRAM_ID, ausdAta, fromUnits, toUnits } from "../lib/ausd.js";
import { buildBondDepositTx } from "../lib/bond.js";
import { writeLedgerEntry } from "../lib/ledger.js";
import { sha256Hex } from "../lib/memo.js";
import { buildPurchaseTx, readPolicy, setPolicyStatusIxs } from "../lib/policy.js";
import { sendIxs, serializeForWallet } from "../lib/tx.js";

const DEVNET_CHAIN_ID = "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1"; // devnet genesis hash
const ACTIONS_VERSION = "2.4";
const TERM_DAYS = 365; // plan v3 6.5: at least 30 days so the future-dated replay stays inside

const issuer = loadKeypair("issuer");

const app = express();
app.set("trust proxy", "loopback"); // Caddy on the same box sets X-Forwarded-For
app.use(express.json({ limit: "64kb" }));

// Actions CORS: every Action route must answer OPTIONS and expose these headers.
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
      "X-Admin-Token",
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

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function parseAccount(value: unknown): PublicKey {
  try {
    return new PublicKey(String(value));
  } catch {
    throw new HttpError(400, "Invalid account");
  }
}

// ---------- abuse limits (plan v3 9.3) ----------

const hits = new Map<string, number[]>();
setInterval(() => {
  const cutoff = Date.now() - 60_000;
  for (const [key, times] of hits) if (times.every((t) => t < cutoff)) hits.delete(key);
}, 60_000).unref();

function rateLimit(perMinute: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${req.path}:${req.ip}`;
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((t) => now - t < 60_000);
    if (recent.length >= perMinute) {
      res.status(429).json({ message: "Too many requests; try again in a minute." });
      return;
    }
    recent.push(now);
    hits.set(key, recent);
    next();
  };
}

function requireAllowlisted(account: PublicKey) {
  if (!env.demoMode || env.demoWallets.length === 0) return;
  if (!env.demoWallets.includes(account.toBase58())) {
    throw new HttpError(403, "Demo mode: this wallet is not on the demo allowlist.");
  }
}

function requireAdmin(req: Request) {
  if (!env.adminToken || req.header("x-admin-token") !== env.adminToken) throw new HttpError(401, "Admin token required");
}

/** /chain/reset listens on localhost only: direct loopback connection, not via Caddy. */
function requireLocal(req: Request) {
  const addr = req.socket.remoteAddress ?? "";
  const loopback = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(addr);
  if (!loopback || req.header("x-forwarded-for")) throw new HttpError(403, "Localhost only");
}

const flowOf = (req: Request): "a" | "b" =>
  req.query.flow === "a" || req.query.flow === "b" ? req.query.flow : (env.purchaseFlow as "a" | "b");

app.get("/health", (_req, res) => {
  res.json({ ok: true, demoMode: env.demoMode, purchaseFlow: env.purchaseFlow });
});

app.get("/actions.json", (_req, res) => {
  res.json({ rules: [{ pathPattern: "/api/actions/**", apiPath: "/api/actions/**" }] });
});

app.get("/icon.svg", (_req, res) => {
  res.type("image/svg+xml").send(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#1f4e79"/>` +
      `<path d="M0 360 Q128 300 256 360 T512 360 V512 H0Z" fill="#4aa3df"/>` +
      `<text x="256" y="250" font-family="Arial" font-size="150" font-weight="700" fill="#fff" text-anchor="middle">Atlas</text></svg>`,
  );
});

// ---------- purchase (plan v3 8.3) ----------

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
        `Premium ${quote.premium.toFixed(2)} aUSD. Immediate needs only; not property insurance. Devnet test money.`,
      label: `Buy for ${quote.premium.toFixed(2)} aUSD`,
      disabled: !quote.sales_open,
      ...(quote.sales_open ? {} : { error: { message: quote.reason ?? "Sales are closed for this gauge" } }),
      links: {
        actions: [
          {
            type: "transaction",
            label: `Buy for ${quote.premium.toFixed(2)} aUSD`,
            href: `/api/actions/buy?gauge=${encodeURIComponent(gauge)}&payout=${payout}&flow=a`,
          },
        ],
      },
    });
  }),
);

app.post(
  "/api/actions/buy",
  rateLimit(5),
  wrap(async (req, res) => {
    const gauge = String(req.query.gauge ?? "");
    const payout = Number(req.query.payout ?? env.defaultPayout);
    const flow = flowOf(req);
    const buyer = parseAccount(req.body?.account);
    requireAllowlisted(buyer);
    if (await dbq.activeReservationFor(buyer.toBase58())) {
      throw new HttpError(409, "This wallet already has a purchase in progress; finish it or wait 2 minutes.");
    }
    const quote = await getQuote(gauge, payout);
    if (!quote.sales_open) throw new HttpError(403, quote.reason ?? "Sales are closed for this gauge");
    const reservation = await dbq.reservePolicyMint(gauge, buyer.toBase58(), quote.premium, payout);
    if (!reservation) throw new HttpError(409, `No policies left for gauge ${gauge}. Run npm run precreate.`);

    const tx = await buildPurchaseTx({
      connection,
      buyer,
      policyMint: new PublicKey(reservation.policyMint),
      policyId: reservation.policyId,
      issuer: issuer.publicKey,
      ausdMint: requireState("ausdMint"),
      vault: requireState("vault"),
      premiumUnits: toUnits(quote.premium),
    });
    if (flow === "a") {
      tx.partialSign(issuer);
    } else {
      // Flow B: remember exactly what we built; submit co-signs only this message.
      await dbq.setReservationMessageHash(reservation.policyMint, sha256Hex(tx.serializeMessage().toString("base64")));
    }
    res.json({
      type: "transaction",
      flow,
      transaction: serializeForWallet(tx),
      message: `Atlas policy on gauge ${gauge}: ${quote.premium.toFixed(2)} aUSD premium, ${payout} aUSD payout.`,
      policy_mint: reservation.policyMint,
      ...(flow === "b" ? { submit: "/api/purchase/submit" } : {}),
    });
  }),
);

/** Flow B: the wallet has signed; check it is byte-for-byte the message we built, co-sign, send. */
app.post(
  "/api/purchase/submit",
  rateLimit(5),
  wrap(async (req, res) => {
    const tx = Transaction.from(Buffer.from(String(req.body?.transaction ?? ""), "base64"));
    const reservation = await dbq.reservationByMessageHash(sha256Hex(tx.serializeMessage().toString("base64")));
    if (!reservation) throw new HttpError(409, "Unknown, changed or expired purchase; request a new one.");
    tx.partialSign(issuer);
    if (!tx.verifySignatures()) throw new HttpError(400, "Missing or invalid wallet signature.");
    const signature = await connection.sendRawTransaction(tx.serialize());
    await connection.confirmTransaction(signature, "confirmed");
    res.json({ signature, explorer: explorer(signature), policy_mint: reservation.policy_mint });
  }),
);

// ---------- bond deposit (plan v3 8.8): wallet signs first, server co-signs and submits ----------

const pendingBonds = new Map<string, { investor: string; amount: number; expires: number }>();

app.post(
  "/api/bond/deposit",
  rateLimit(5),
  wrap(async (req, res) => {
    const investor = parseAccount(req.body?.account);
    requireAllowlisted(investor);
    const amount = Number(req.body?.amount);
    if (!(amount > 0)) throw new HttpError(400, "amount must be a positive number of aUSD");
    const navPerUnit = await getNavPerUnit();
    const tx = await buildBondDepositTx({
      connection,
      investor,
      issuer: issuer.publicKey,
      ausdMint: requireState("ausdMint"),
      bondMint: requireState("bondMint"),
      vault: requireState("vault"),
      depositUnits: toUnits(amount),
      navPerUnit,
    });
    for (const [k, v] of pendingBonds) if (v.expires < Date.now()) pendingBonds.delete(k);
    pendingBonds.set(sha256Hex(tx.serializeMessage().toString("base64")), {
      investor: investor.toBase58(),
      amount,
      expires: Date.now() + 120_000,
    });
    res.json({ type: "transaction", transaction: serializeForWallet(tx), nav_per_unit: navPerUnit, submit: "/api/bond/submit" });
  }),
);

app.post(
  "/api/bond/submit",
  rateLimit(5),
  wrap(async (req, res) => {
    const tx = Transaction.from(Buffer.from(String(req.body?.transaction ?? ""), "base64"));
    const key = sha256Hex(tx.serializeMessage().toString("base64"));
    const pending = pendingBonds.get(key);
    if (!pending || pending.expires < Date.now()) throw new HttpError(409, "Unknown, changed or expired deposit; request a new one.");
    tx.partialSign(issuer);
    if (!tx.verifySignatures()) throw new HttpError(400, "Missing or invalid wallet signature.");
    const signature = await connection.sendRawTransaction(tx.serialize());
    await connection.confirmTransaction(signature, "confirmed");
    pendingBonds.delete(key);
    await writeLedgerEntry({
      runId: await dbq.currentRunId(),
      entryId: `bond:${signature}`,
      memo: `bond deposit by ${pending.investor}`,
      txSig: signature,
      rows: [
        { account: "investors", amount: -pending.amount },
        { account: "bond", amount: pending.amount },
      ],
    });
    res.json({ signature, explorer: explorer(signature) });
  }),
);

// ---------- policies ----------

app.get(
  "/policies",
  wrap(async (req, res) => {
    res.json(await dbq.policiesByOwner(parseAccount(req.query.owner).toBase58()));
  }),
);

app.get(
  "/policies/:mint/onchain",
  wrap(async (req, res) => {
    const policy = await readPolicy(connection, parseAccount(req.params.mint));
    res.json({ ...policy, supply: policy.supply.toString(), explorer: explorer(policy.mint, "address") });
  }),
);

app.get(
  "/terms/:policyId.json",
  wrap(async (req, res) => {
    const row = await dbq.poolRow(String(req.params.policyId));
    if (!row) throw new HttpError(404, "Unknown policy");
    res.json({
      policy_id: row.policy_id,
      gauge_id: row.gauge_id,
      payout_aUSD: row.payout_usd ?? env.defaultPayout,
      premium_aUSD: row.premium_usd,
      term_days: TERM_DAYS,
      trigger: "An event opens after two consecutive accepted readings at or above the gauge's trigger level",
      storm_payment: "Interim share at once; true-up when the storm closes. Everyone in a storm ends with the same share.",
      one_payout_per_term: true,
      covers: "Immediate needs only. Not property insurance. Devnet test product.",
      terms_hash: row.terms_hash,
    });
  }),
);

// ---------- balances and reset (plan v3 6.6, 8.9) ----------

async function balances() {
  const ausdMint = requireState("ausdMint");
  const vault = requireState("vault");
  const bot = loadKeypair("bot").publicKey;
  const bal = async (owner: PublicKey, offCurve = false) => {
    try {
      return fromUnits((await getAccount(connection, ausdAta(ausdMint, owner, offCurve), "confirmed", AUSD_PROGRAM_ID)).amount);
    } catch {
      return 0;
    }
  };
  const bondMint = requireState("bondMint");
  return {
    vault: await bal(vault, true),
    float: await bal(bot),
    bond_units: fromUnits((await getMint(connection, bondMint, "confirmed")).supply),
    ausd_supply: fromUnits((await getMint(connection, ausdMint, "confirmed")).supply),
    at: new Date().toISOString(),
  };
}

// Read-only; the engine records these as a run's opening balances and reconciles against them.
app.get("/chain/balances", wrap(async (_req, res) => res.json(await balances())));

app.post(
  "/chain/reset",
  wrap(async (req, res) => {
    requireLocal(req);
    requireAdmin(req);
    const runId = String(req.body?.run_id ?? "session");
    const treasury = loadKeypair("treasury"); // aUSD mint authority
    const ausdMint = requireState("ausdMint");
    const before = await balances();

    // 1. Refill vault and float up to the setup snapshot by minting test aUSD.
    const refills: { account: "reserve" | "float"; owner: PublicKey; offCurve: boolean; amount: number }[] = [
      { account: "reserve", owner: requireState("vault"), offCurve: true, amount: env.snapshotVault - before.vault },
      { account: "float", owner: loadKeypair("bot").publicKey, offCurve: false, amount: env.snapshotFloat - before.float },
    ];
    for (const r of refills.filter((x) => x.amount > 0)) {
      const sig = await sendIxs(
        connection,
        [createMintToInstruction(ausdMint, ausdAta(ausdMint, r.owner, r.offCurve), treasury.publicKey, toUnits(r.amount), [], AUSD_PROGRAM_ID)],
        [treasury],
      );
      await writeLedgerEntry({
        runId,
        entryId: `refill:${sig}`,
        memo: `reset refill of ${r.account} to snapshot`,
        txSig: sig,
        rows: [
          { account: "seeded", amount: -r.amount },
          { account: r.account, amount: r.amount },
        ],
      });
    }

    // 2. Demo policies back to ACTV, name and status, on-chain (3 per transaction).
    const mints = await dbq.demoPolicyMints();
    for (let i = 0; i < mints.length; i += 3) {
      await sendIxs(
        connection,
        mints.slice(i, i + 3).flatMap((m) => setPolicyStatusIxs(new PublicKey(m), issuer.publicKey, "ACTV")),
        [issuer],
      );
    }

    // 3. Same in Tiger; release reservations.
    await dbq.resetDemoPoliciesDb();
    const released = await dbq.releaseReservations();

    res.json({ ok: true, run_id: runId, before, after: await balances(), policies_reset: mints.length, reservations_released: released });
  }),
);

app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
  if (!(err instanceof HttpError)) console.error(err);
  res.status(err.status ?? 500).json({ message: err.message });
});

// ---------- confirmer: confirmed purchases become policies + a premium ledger entry ----------

async function confirmPurchases(): Promise<void> {
  for (const row of await dbq.reservedMints()) {
    try {
      const mint = new PublicKey(row.policy_mint);
      const policy = await readPolicy(connection, mint);
      if (policy.supply !== 1n || !policy.holder) continue;
      const [latest] = await connection.getSignaturesForAddress(mint, { limit: 1 }, "confirmed");
      const txSig = latest?.signature ?? null;
      await dbq.markSold(
        {
          policyMint: row.policy_mint,
          owner: policy.holder,
          gaugeId: row.gauge_id,
          premiumUsd: row.premium_usd,
          payoutUsd: row.payout_usd,
          waitingDays: env.demoMode ? 0 : 7,
          termDays: TERM_DAYS,
          demo: env.demoMode,
          txSig,
        },
        (c, runId) =>
          writeLedgerEntry(
            {
              runId,
              entryId: `premium:${row.policy_mint}`,
              memo: `premium for ${row.policy_id}`,
              txSig,
              rows: [
                { account: "holders", amount: -row.premium_usd },
                { account: "premiums", amount: row.premium_usd },
              ],
            },
            c,
          ),
      );
      console.log(`sold ${row.policy_id} (${row.policy_mint}) to ${policy.holder}`);
    } catch (err) {
      console.warn(`confirmer: ${row.policy_mint}: ${String(err)}`);
    }
  }
}

setInterval(() => void confirmPurchases().catch((e) => console.warn("confirmer", e)), 4_000);

app.listen(env.port, env.host, () => {
  console.log(
    `atlas chain service on ${env.host}:${env.port} (demo mode ${env.demoMode ? "on" : "off"}, purchase flow ${env.purchaseFlow.toUpperCase()})`,
  );
  if (env.demoMode && env.demoWallets.length === 0) console.warn("DEMO_WALLETS is empty: buy and bond accept any wallet.");
  if (!env.adminToken) console.warn("ADMIN_TOKEN is empty: /chain/reset is disabled.");
});
