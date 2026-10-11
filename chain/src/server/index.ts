// Chain service (plan v3 4.1, 8, 9): the only process besides the bot that holds signing keys.
// Purchase (Flow A or B), bond deposit, sponsor donation, Solana Actions, policies, the chain side of reset, and
// balances for the engine's reconciliation. Python never builds or signs a transaction.
import { createMintToInstruction, getAccount, getMint } from "@solana/spl-token";
import { PublicKey, Transaction } from "@solana/web3.js";
import cors from "cors";
import { timingSafeEqual } from "node:crypto";
import express, { NextFunction, Request, Response } from "express";
import * as dbq from "../db.js";
import { EngineError, getNavPerUnit, getQuote } from "../engine.js";
import { connection, env, explorer, loadKeypair, requireState } from "../env.js";
import { AUSD_PROGRAM_ID, ausdAta, fromUnits, toUnits } from "../lib/ausd.js";
import { buildBondDepositTx } from "../lib/bond.js";
import { buildDonationTx } from "../lib/donation.js";
import { writeLedgerEntry } from "../lib/ledger.js";
import { sha256Hex } from "../lib/memo.js";
import { buildPurchaseTx, readPolicy, setPolicyStatusIxs } from "../lib/policy.js";
import { sendIxs, serializeForWallet } from "../lib/tx.js";

const DEVNET_CHAIN_ID = "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1"; // devnet genesis hash
const ACTIONS_VERSION = "2.4";
const TERM_DAYS = env.termDays; // at least 30 days so the future-dated replay stays inside (plan v3 6.5); engine prices the same term

const issuer = loadKeypair("issuer");

const app = express();
app.set("trust proxy", "loopback"); // the gateway on the same machine sets X-Forwarded-For
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

/** Only the payout amounts on offer; anything else (huge, negative, NaN) is refused. */
function parsePayout(value: unknown): number {
  const payout = value === undefined ? env.defaultPayout : Number(value);
  if (!env.payoutOptions.includes(payout)) {
    throw new HttpError(400, `payout must be one of ${env.payoutOptions.join(", ")} aUSD`);
  }
  return payout;
}

/**
 * Wait for a signature to reach "confirmed" by polling its status (no websocket), up to
 * `timeoutMs`. Returns the block time once confirmed, null if still unknown, and throws if it
 * failed on-chain.
 */
async function waitConfirmed(signature: string, timeoutMs = 45_000): Promise<Date | null> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    // An RPC hiccup (e.g. a 429) after the send must not turn into a failure reply: the
    // transaction may still land, and a user who sees "failed" would pay again. Keep polling.
    const st = await connection
      .getSignatureStatuses([signature], { searchTransactionHistory: true })
      .then((r) => r.value[0])
      .catch(() => undefined);
    if (st?.err) throw new HttpError(400, `Transaction failed on-chain: ${JSON.stringify(st.err)}`);
    if (st && (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized")) {
      const t = await connection.getBlockTime(st.slot).catch(() => null);
      return t ? new Date(t * 1000) : new Date();
    }
    await new Promise((r) => setTimeout(r, 1_500));
  }
  return null;
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
    // The route pattern, not the raw path: Express matches /api/Actions/buy/ too, which
    // would otherwise get its own bucket.
    const key = `${req.route?.path ?? req.path.toLowerCase()}:${req.ip}`;
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
  if (!env.demoMode) return;
  // Demo mode with an empty allowlist refuses everyone rather than accepting everyone.
  if (!env.demoWallets.includes(account.toBase58())) {
    throw new HttpError(403, "Demo mode: this wallet is not on the demo allowlist.");
  }
}

function requireAdmin(req: Request) {
  const given = Buffer.from(req.header("x-admin-token") ?? "");
  const want = Buffer.from(env.adminToken ?? "");
  if (!want.length || given.length !== want.length || !timingSafeEqual(given, want)) throw new HttpError(401, "Admin token required");
}

/** /chain/reset is localhost only: a direct loopback connection, never via the gateway or tunnel. */
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
    const payout = parsePayout(req.query.payout);
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
  rateLimit(30), // per route per IP: judges on venue Wi-Fi share one IP
  wrap(async (req, res) => {
    const gauge = String(req.query.gauge ?? "");
    const payout = parsePayout(req.query.payout);
    const flow = flowOf(req);
    const buyer = parseAccount(req.body?.account);
    requireAllowlisted(buyer);
    // A reservation needs no signature, so anyone could reserve on a demo wallet's behalf and
    // lock it out with 409s. An open reservation for the same gauge and payout is therefore
    // handed back (same mint, same premium) instead of refused.
    // One policy per household: a wallet with protection still in force can't buy another.
    const inForce = await dbq.activePoliciesOf(buyer.toBase58());
    if (inForce.length >= env.maxActivePerWallet) {
      const until = inForce[0].ends_at.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      throw new HttpError(409, `This wallet is already protected until ${until}. One policy per household.`);
    }
    const existing = await dbq.activeReservationDetail(buyer.toBase58());
    if (existing && (existing.gaugeId !== gauge || existing.payoutUsd !== payout)) {
      throw new HttpError(409, "This wallet already has a purchase in progress; finish it or wait 2 minutes.");
    }
    let reservation: { policyMint: string; policyId: string };
    let premium: number;
    if (existing) {
      reservation = existing;
      premium = existing.premiumUsd;
    } else {
      const quote = await getQuote(gauge, payout);
      if (!quote.sales_open) throw new HttpError(403, quote.reason ?? "Sales are closed for this gauge");
      if (!(Number.isFinite(quote.premium) && quote.premium > 0)) throw new HttpError(503, "No valid premium from the engine");
      const r = await dbq.reservePolicyMint(gauge, buyer.toBase58(), quote.premium, payout);
      if (r === "busy") throw new HttpError(409, "This wallet already has a purchase in progress; finish it or wait 2 minutes.");
      if (!r) throw new HttpError(409, `No policies left for gauge ${gauge}. Run npm run precreate.`);
      reservation = r;
      premium = quote.premium;
    }

    const tx = await buildPurchaseTx({
      connection,
      buyer,
      policyMint: new PublicKey(reservation.policyMint),
      policyId: reservation.policyId,
      issuer: issuer.publicKey,
      ausdMint: requireState("ausdMint"),
      vault: requireState("vault"),
      premiumUnits: toUnits(premium),
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
      message: `Atlas policy on gauge ${gauge}: ${premium.toFixed(2)} aUSD premium, ${payout} aUSD payout.`,
      policy_mint: reservation.policyMint,
      ...(flow === "b" ? { submit: "/api/purchase/submit" } : {}),
    });
  }),
);

/** Flow B: the wallet has signed; check it is byte-for-byte the message we built, co-sign, send. */
app.post(
  "/api/purchase/submit",
  rateLimit(30), // per route per IP: judges on venue Wi-Fi share one IP
  wrap(async (req, res) => {
    const tx = Transaction.from(Buffer.from(String(req.body?.transaction ?? ""), "base64"));
    const reservation = await dbq.reservationByMessageHash(sha256Hex(tx.serializeMessage().toString("base64")));
    if (!reservation) throw new HttpError(409, "Unknown, changed or expired purchase; request a new one.");
    tx.partialSign(issuer);
    if (!tx.verifySignatures()) throw new HttpError(400, "Missing or invalid wallet signature.");
    const signature = await connection.sendRawTransaction(tx.serialize());
    // The confirmer books the policy from chain state either way; this only shapes the reply.
    const landed = await waitConfirmed(signature);
    res.status(landed ? 200 : 202).json({ signature, explorer: explorer(signature), policy_mint: reservation.policy_mint, confirmed: !!landed });
  }),
);

// ---------- bond deposit (plan v3 8.8): wallet signs first, server co-signs and submits ----------

const pendingBonds = new Map<string, { investor: string; amount: number; expires: number }>();
// Sent deposits waiting for their ledger entry: booked by the confirmer loop if the submit
// request timed out before confirmation. In memory: a restart in that window needs a manual entry.
const unbookedBonds = new Map<string, { investor: string; amount: number; sentAt: number }>();

async function bookBond(signature: string, b: { investor: string; amount: number }, landedAt: Date): Promise<void> {
  await writeLedgerEntry({
    runId: await dbq.currentRunId(landedAt),
    entryId: `bond:${signature}`, // idempotent: a second booking of the same signature writes nothing
    memo: `bond deposit by ${b.investor}`,
    txSig: signature,
    rows: [
      { account: "investors", amount: -b.amount },
      { account: "bond", amount: b.amount },
    ],
  });
  unbookedBonds.delete(signature);
}

async function settleBonds(): Promise<void> {
  if (!unbookedBonds.size) return;
  const sigs = [...unbookedBonds.keys()];
  const statuses = (await connection.getSignatureStatuses(sigs, { searchTransactionHistory: true })).value;
  for (const [n, sig] of sigs.entries()) {
    const b = unbookedBonds.get(sig)!;
    const st = statuses[n];
    if (st?.err) {
      unbookedBonds.delete(sig);
      console.warn(`bond ${sig} failed on-chain; nothing booked`);
    } else if (st && (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized")) {
      const t = await connection.getBlockTime(st.slot).catch(() => null);
      await bookBond(sig, b, t ? new Date(t * 1000) : new Date());
      console.log(`bond ${sig} booked after confirmation`);
    } else if (!st && Date.now() - b.sentAt > 5 * 60_000) {
      unbookedBonds.delete(sig);
      console.warn(`bond ${sig} never landed; nothing booked`);
    }
  }
}

app.post(
  "/api/bond/deposit",
  rateLimit(30), // per route per IP: judges on venue Wi-Fi share one IP
  wrap(async (req, res) => {
    const investor = parseAccount(req.body?.account);
    requireAllowlisted(investor);
    const raw = Number(req.body?.amount);
    // Round to whole aUSD units so the ledger books exactly what moves on-chain.
    const amount = Number.isFinite(raw) && Math.abs(raw) < 1e12 ? fromUnits(toUnits(raw)) : NaN;
    if (!(Number.isFinite(amount) && amount > 0 && amount <= env.maxBondDeposit)) {
      throw new HttpError(400, `amount must be a number of aUSD between 0 and ${env.maxBondDeposit}`);
    }
    const navPerUnit = await getNavPerUnit();
    if (navPerUnit === null) throw new HttpError(503, "Bond NAV unavailable (engine down); try again shortly.");
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
  rateLimit(30), // per route per IP: judges on venue Wi-Fi share one IP
  wrap(async (req, res) => {
    const tx = Transaction.from(Buffer.from(String(req.body?.transaction ?? ""), "base64"));
    const key = sha256Hex(tx.serializeMessage().toString("base64"));
    const pending = pendingBonds.get(key);
    if (!pending || pending.expires < Date.now()) throw new HttpError(409, "Unknown, changed or expired deposit; request a new one.");
    tx.partialSign(issuer);
    if (!tx.verifySignatures()) throw new HttpError(400, "Missing or invalid wallet signature.");
    pendingBonds.delete(key); // before sending: a double submit of the same deposit gets 409
    const signature = await connection.sendRawTransaction(tx.serialize());
    unbookedBonds.set(signature, { investor: pending.investor, amount: pending.amount, sentAt: Date.now() });
    const landed = await waitConfirmed(signature);
    if (landed) await bookBond(signature, pending, landed);
    res.status(landed ? 200 : 202).json({ signature, explorer: explorer(signature), confirmed: !!landed });
  }),
);

// ---------- sponsor donation (docs/readiness.md): wallet signs, server checks and submits ----------

const pendingDonations = new Map<string, { donor: string; amount: number; expires: number }>();
// Sent donations waiting for their ledger entry (same recovery as bond deposits).
const unbookedDonations = new Map<string, { donor: string; amount: number; sentAt: number }>();

async function bookDonation(signature: string, d: { donor: string; amount: number }, landedAt: Date): Promise<void> {
  await writeLedgerEntry({
    runId: await dbq.currentRunId(landedAt),
    entryId: `donation:${signature}`, // idempotent per signature
    memo: `donation by ${d.donor}`,
    txSig: signature,
    rows: [
      { account: "donors", amount: -d.amount },
      { account: "donations", amount: d.amount },
    ],
  });
  unbookedDonations.delete(signature);
}

async function settleDonations(): Promise<void> {
  if (!unbookedDonations.size) return;
  const sigs = [...unbookedDonations.keys()];
  const statuses = (await connection.getSignatureStatuses(sigs, { searchTransactionHistory: true })).value;
  for (const [n, sig] of sigs.entries()) {
    const d = unbookedDonations.get(sig)!;
    const st = statuses[n];
    if (st?.err) {
      unbookedDonations.delete(sig);
      console.warn(`donation ${sig} failed on-chain; nothing booked`);
    } else if (st && (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized")) {
      const t = await connection.getBlockTime(st.slot).catch(() => null);
      await bookDonation(sig, d, t ? new Date(t * 1000) : new Date());
      console.log(`donation ${sig} booked after confirmation`);
    } else if (!st && Date.now() - d.sentAt > 5 * 60_000) {
      unbookedDonations.delete(sig);
      console.warn(`donation ${sig} never landed; nothing booked`);
    }
  }
}

app.post(
  "/api/readiness/fund",
  rateLimit(30), // per route per IP: judges on venue Wi-Fi share one IP
  wrap(async (req, res) => {
    const donor = parseAccount(req.body?.account);
    requireAllowlisted(donor);
    const raw = Number(req.body?.amount);
    // Round to whole aUSD units so the ledger books exactly what moves on-chain.
    const amount = Number.isFinite(raw) && Math.abs(raw) < 1e12 ? fromUnits(toUnits(raw)) : NaN;
    if (!(Number.isFinite(amount) && amount > 0 && amount <= env.maxDonation)) {
      throw new HttpError(400, `amount must be a number of aUSD between 0 and ${env.maxDonation}`);
    }
    const tx = await buildDonationTx({
      connection,
      donor,
      ausdMint: requireState("ausdMint"),
      vault: requireState("vault"),
      amountUnits: toUnits(amount),
    });
    for (const [k, v] of pendingDonations) if (v.expires < Date.now()) pendingDonations.delete(k);
    pendingDonations.set(sha256Hex(tx.serializeMessage().toString("base64")), {
      donor: donor.toBase58(),
      amount,
      expires: Date.now() + 120_000,
    });
    res.json({ type: "transaction", transaction: serializeForWallet(tx), submit: "/api/readiness/submit" });
  }),
);

app.post(
  "/api/readiness/submit",
  rateLimit(30), // per route per IP: judges on venue Wi-Fi share one IP
  wrap(async (req, res) => {
    const tx = Transaction.from(Buffer.from(String(req.body?.transaction ?? ""), "base64"));
    const key = sha256Hex(tx.serializeMessage().toString("base64"));
    const pending = pendingDonations.get(key);
    if (!pending || pending.expires < Date.now()) throw new HttpError(409, "Unknown, changed or expired donation; request a new one.");
    if (!tx.verifySignatures()) throw new HttpError(400, "Missing or invalid wallet signature.");
    pendingDonations.delete(key); // before sending: a double submit of the same donation gets 409
    const signature = await connection.sendRawTransaction(tx.serialize());
    unbookedDonations.set(signature, { donor: pending.donor, amount: pending.amount, sentAt: Date.now() });
    const landed = await waitConfirmed(signature);
    if (landed) await bookDonation(signature, pending, landed);
    res.status(landed ? 200 : 202).json({ signature, explorer: explorer(signature), confirmed: !!landed });
  }),
);

// ---------- policies ----------

app.get(
  "/policies",
  wrap(async (req, res) => {
    res.json(await dbq.policiesByOwner(parseAccount(req.query.owner).toBase58()));
  }),
);

// ---------- account views by role (docs/readiness.md): what a wallet holds ----------

app.get(
  "/api/account/sponsor",
  rateLimit(30),
  wrap(async (req, res) => {
    const donations = await dbq.donationsByDonor(parseAccount(req.query.owner).toBase58());
    res.json({ donated_total: donations.reduce((s, d) => s + d.amount, 0), donations });
  }),
);

app.get(
  "/api/account/investor",
  rateLimit(30),
  wrap(async (req, res) => {
    const owner = parseAccount(req.query.owner);
    const held = await freshRead(() => connection.getParsedTokenAccountsByOwner(owner, { mint: requireState("bondMint") }, "confirmed"));
    const units = held.reduce((s, a) => s + (a.account.data.parsed.info.tokenAmount.uiAmount ?? 0), 0);
    const nav = await getNavPerUnit();
    res.json({ units, nav_per_unit: nav, value_usd: nav === null ? null : units * nav });
  }),
);

app.get(
  "/policies/:mint/onchain",
  wrap(async (req, res) => {
    const owner = req.query.owner ? parseAccount(req.query.owner) : undefined;
    const policy = await readPolicy(connection, parseAccount(req.params.mint), owner);
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

// The RPC provider load-balances across nodes that can be minutes apart, so the same balance read can
// flip between the old and new value. Every read reports the slot it was served at; an answer from a
// slot older than one already seen is from a lagging node, so ask again.
let highestSlotSeen = 0;
async function freshRead<T>(read: () => Promise<{ context: { slot: number }; value: T }>): Promise<T> {
  let last: { context: { slot: number }; value: T } | undefined;
  for (let attempt = 0; attempt < 8; attempt++) {
    last = await read();
    if (last.context.slot >= highestSlotSeen) {
      highestSlotSeen = last.context.slot;
      return last.value;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return last!.value; // every node answered behind: better a slightly old balance than none
}

async function balances() {
  const ausdMint = requireState("ausdMint");
  const vault = requireState("vault");
  const bot = loadKeypair("bot").publicKey;
  const bal = async (owner: PublicKey, offCurve = false) => {
    try {
      const v = await freshRead(() => connection.getTokenAccountBalance(ausdAta(ausdMint, owner, offCurve), "confirmed"));
      return fromUnits(v.amount);
    } catch {
      return 0;
    }
  };
  const bondMint = requireState("bondMint");
  return {
    vault: await bal(vault, true),
    float: await bal(bot),
    bond_units: fromUnits((await freshRead(() => connection.getTokenSupply(bondMint, "confirmed"))).amount),
    ausd_supply: fromUnits((await freshRead(() => connection.getTokenSupply(ausdMint, "confirmed"))).amount),
    at: new Date().toISOString(),
  };
}

// Read-only; the engine records these as a run's opening balances and reconciles against them.
// Public callers (through the gateway) are rate-limited and served a 3 s cache, so a loop can't
// burn the RPC quota; the engine on localhost always gets a fresh read.
let balancesCache: { at: number; value: Awaited<ReturnType<typeof balances>> } | null = null;
const publicLimit = rateLimit(60);
app.get(
  "/chain/balances",
  (req, res, next) => (req.header("x-forwarded-for") ? publicLimit(req, res, next) : next()),
  wrap(async (req, res) => {
    if (req.header("x-forwarded-for") && balancesCache && Date.now() - balancesCache.at < 3_000) return void res.json(balancesCache.value);
    const value = await balances();
    balancesCache = { at: Date.now(), value };
    res.json(value);
  }),
);

app.post(
  "/chain/reset",
  wrap(async (req, res) => {
    requireLocal(req);
    requireAdmin(req);
    // One reset at a time: two overlapping resets would both read the same balances and both mint the shortfall.
    if (resetting) throw new HttpError(409, "A reset is already in progress.");
    resetting = true;
    try {
      await doReset(req, res);
    } finally {
      resetting = false;
    }
  }),
);

let resetting = false;

async function doReset(req: Request, res: Response): Promise<void> {
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
      // No automatic retry: a retry after a send that actually landed would mint twice while the
      // ledger records once. If it fails, Reset again: the shortfall is recomputed from balances.
      const sig = await sendIxs(
        connection,
        [createMintToInstruction(ausdMint, ausdAta(ausdMint, r.owner, r.offCurve), treasury.publicKey, toUnits(r.amount), [], AUSD_PROGRAM_ID)],
        [treasury],
        1,
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

    // 3. Same in Tiger; release reservations whose purchase never landed. A landed one (supply 1)
    //    stays reserved so the confirmer records the policy instead of losing it.
    await dbq.resetDemoPoliciesDb();
    let released = 0;
    for (const row of await dbq.reservedMints()) {
      const onchain = await readPolicy(connection, new PublicKey(row.policy_mint), new PublicKey(row.reserved_by));
      if (onchain.supply === 0n && (await dbq.releaseReservation(row.policy_mint))) released++;
    }

    res.json({ ok: true, run_id: runId, before, after: await balances(), policies_reset: mints.length, reservations_released: released });
}


app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
  // An engine 4xx (unknown gauge, bad input) is the caller's error; pass its status through.
  if (err instanceof EngineError && err.status !== null && err.status < 500) {
    res.status(err.status).json({ message: err.message });
    return;
  }
  if (!(err instanceof HttpError)) console.error(err);
  res.status(err.status ?? 500).json({ message: err.message });
});

// ---------- confirmer: confirmed purchases become policies + a premium ledger entry ----------

// Unpaid reservations are freed only well after the purchase blockhash can no longer land.
const RELEASE_AFTER_MS = 2 * 60_000;

async function confirmPurchases(): Promise<void> {
  for (const row of await dbq.reservedMints()) {
    try {
      const mint = new PublicKey(row.policy_mint);
      const policy = await readPolicy(connection, mint, new PublicKey(row.reserved_by));
      if (policy.supply === 0n) {
        const expiredFor = row.reserved_until ? Date.now() - new Date(row.reserved_until).getTime() : 0;
        if (expiredFor > RELEASE_AFTER_MS && (await dbq.releaseReservation(row.policy_mint))) {
          console.log(`released unpaid reservation ${row.policy_id}`);
        }
        continue;
      }
      if (!policy.holder) {
        console.warn(`confirmer: ${row.policy_mint} has supply ${policy.supply} but ${row.reserved_by} does not hold it`);
        continue;
      }
      // Oldest first: [precreate, purchase, later status updates...]. The purchase is the second.
      // Failed attempts (a buyer's rejected try) are skipped, so the recorded signature is the real purchase.
      const sigs = (await connection.getSignaturesForAddress(mint, { limit: 50 }, "confirmed")).filter((s) => !s.err).reverse();
      const purchase = sigs[1] ?? sigs[0];
      const txSig = purchase?.signature ?? null;
      const landedAt = purchase?.blockTime ? new Date(purchase.blockTime * 1000) : new Date();
      await dbq.markSold(
        {
          policyMint: row.policy_mint,
          owner: policy.holder,
          gaugeId: row.gauge_id,
          premiumUsd: row.premium_usd,
          payoutUsd: row.payout_usd,
          waitingDays: env.waitingDays,
          termDays: TERM_DAYS,
          demo: env.demoMode,
          txSig,
          landedAt,
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

// ---------- vault scan: book deposits and donations the submit path missed ----------
// The pending/unbooked maps above live in memory: a restart between send and confirm, or a wallet
// that broadcasts a signed donation itself (no server signature is needed), would leave money in
// the vault with no ledger entry and turn reconciliation red. Every minute this reads the vault's
// recent transactions, picks the ones whose Memo marks a bond deposit or donation, and books any
// that are missing. Booking is idempotent per signature, so a double booking writes nothing.

const scanned = new Set<string>();
let lastVaultScan = 0;

async function scanVault(): Promise<void> {
  if (Date.now() - lastVaultScan < 60_000) return;
  lastVaultScan = Date.now();
  const ausdMint = requireState("ausdMint");
  const vault = requireState("vault");
  const vaultAta = ausdAta(ausdMint, vault, true);
  const sigs = await connection.getSignaturesForAddress(vaultAta, { limit: 25 }, "confirmed");
  for (const s of sigs) {
    if (s.err || scanned.has(s.signature)) continue;
    const kind = s.memo?.includes("atlas:donation") ? "donation" : s.memo?.includes("atlas:bond:deposit") ? "bond" : null;
    if (!kind) {
      scanned.add(s.signature);
      continue;
    }
    if (unbookedBonds.has(s.signature) || unbookedDonations.has(s.signature)) continue; // the settle loops have it
    const tx = await connection.getTransaction(s.signature, { maxSupportedTransactionVersion: 0, commitment: "confirmed" });
    if (!tx?.meta) continue; // try again next scan
    const owner = vault.toBase58();
    const mint = ausdMint.toBase58();
    const bal = (list: typeof tx.meta.preTokenBalances) =>
      Number(list?.find((b) => b.owner === owner && b.mint === mint)?.uiTokenAmount.amount ?? 0);
    const amount = fromUnits(BigInt(bal(tx.meta.postTokenBalances) - bal(tx.meta.preTokenBalances)));
    const payer = tx.transaction.message.getAccountKeys().get(0)?.toBase58();
    scanned.add(s.signature);
    if (!(amount > 0) || !payer) continue;
    const landedAt = s.blockTime ? new Date(s.blockTime * 1000) : new Date();
    if (kind === "donation") await bookDonation(s.signature, { donor: payer, amount }, landedAt);
    else await bookBond(s.signature, { investor: payer, amount }, landedAt);
  }
}

let confirming = false;
setInterval(() => {
  if (confirming) return; // never overlap: RPC calls are serial and can be slow
  confirming = true;
  void Promise.all([confirmPurchases(), settleBonds(), settleDonations(), scanVault()])
    .catch((e) => console.warn("confirmer", e))
    .finally(() => (confirming = false));
}, 4_000);

app.listen(env.port, env.host, () => {
  console.log(
    `atlas chain service on ${env.host}:${env.port} (demo mode ${env.demoMode ? "on" : "off"}, purchase flow ${env.purchaseFlow.toUpperCase()})`,
  );
  if (env.demoMode && env.demoWallets.length === 0) console.warn("DEMO_WALLETS is empty: demo mode refuses every buy, bond and donation.");
  if (!env.adminToken) console.warn("ADMIN_TOKEN is empty: /chain/reset is disabled.");
});

