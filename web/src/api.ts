// Engine (Ezekiel, read-only FastAPI) and chain service (Jesse) clients, plan v3 4.2.
// Engine calls go to the in-browser mock while VITE_USE_MOCKS=true; chain calls always go to
// the chain service.
import { getAdminToken } from "./admin";
import { config } from "./config";
import { mockEngine } from "./mockEngine";
import type { Gauge, Policy, Pool, Quote, Readiness, ReplayStatus, Storm, Stress } from "./types";

async function http<T>(base: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    // An HTML error page from a proxy is not data: fail loudly instead of rendering it.
    throw new Error(res.ok ? `${path}: unexpected response` : `${path}: HTTP ${res.status}`);
  }
  const b = body as { message?: string; detail?: string };
  if (!res.ok) throw new Error(b.message ?? (typeof b.detail === "string" ? b.detail : null) ?? `${path}: HTTP ${res.status}`);
  return body as T;
}

const eng = <T,>(path: string, init?: RequestInit) => http<T>(config.engineUrl, path, init);
const chain = <T,>(path: string, init?: RequestInit) => http<T>(config.chainUrl, path, init);
const q = encodeURIComponent;
const run = (runId: string | null, sep = "?") => (runId ? `${sep}run_id=${q(runId)}` : "");
const admin = (): RequestInit => ({ method: "POST", headers: { "X-Admin-Token": getAdminToken() ?? "" } });

/**
 * The run the dashboard shows: the latest run unless it was reset, in which case the dashboard
 * is back to live data (the engine still serves a reset run when asked for it by id, which the
 * verify page uses for older payouts).
 */
export const activeRunId = (replay: ReplayStatus | null | undefined): string | null =>
  replay && replay.status !== "reset" ? replay.run_id : null;

export const api = {
  replayStatus: (): Promise<ReplayStatus> => (config.useMocks ? mockEngine.replayStatus() : eng("/replay/status")),
  gauges: (runId: string | null): Promise<Gauge[]> => (config.useMocks ? mockEngine.gauges() : eng(`/gauges${run(runId)}`)),
  quote: (id: string, payout: number, runId: string | null): Promise<Quote> =>
    config.useMocks ? mockEngine.quote(id, payout) : eng(`/quote?gauge=${q(id)}&payout=${payout}${run(runId, "&")}`),
  pool: (runId: string | null): Promise<Pool> => (config.useMocks ? mockEngine.pool() : eng(`/pool${run(runId)}`)),
  storms: (runId: string | null): Promise<Storm[]> => (config.useMocks ? mockEngine.storms() : eng(`/storms${run(runId)}`)),
  stress: (scenario: "harvey" | "worst_year"): Promise<Stress> =>
    config.useMocks ? mockEngine.stress() : eng(`/stress?scenario=${scenario}`),
  readiness: (): Promise<Readiness> => (config.useMocks ? mockEngine.readiness() : eng("/readiness")),
  replayStart: (): Promise<{ run_id: string }> => (config.useMocks ? mockEngine.replayStart() : eng("/replay/start", admin())),
  replayReset: (): Promise<{ run_id: string }> => (config.useMocks ? mockEngine.replayReset() : eng("/replay/reset", admin())),

  // Sign-in check: is this address one the demo accepts?
  demoAllowed: (address: string) => chain<{ allowed: boolean }>(`/api/demo/allowed?address=${q(address)}`),

  // Account views by role (chain service)
  sponsorAccount: (owner: string) =>
    chain<{ donated_total: number; donations: { amount: number; tx_sig: string | null; at: string }[] }>(`/api/account/sponsor?owner=${q(owner)}`),
  investorAccount: (owner: string) =>
    chain<{ units: number; nav_per_unit: number | null; value_usd: number | null }>(`/api/account/investor?owner=${q(owner)}`),

  // Chain service
  policies: (owner: string): Promise<Policy[]> => chain(`/policies?owner=${q(owner)}`),
  buyTx: (gaugeId: string, payout: number, account: string) =>
    chain<{ transaction: string; message: string; policy_mint: string; flow: "a" | "b" }>(
      `/api/actions/buy?gauge=${q(gaugeId)}&payout=${payout}&flow=${config.purchaseFlow}`,
      { method: "POST", body: JSON.stringify({ account }) },
    ),
  purchaseSubmit: (transaction: string) =>
    chain<{ signature: string }>("/api/purchase/submit", { method: "POST", body: JSON.stringify({ transaction }) }),
  bondDepositTx: (account: string, amount: number) =>
    chain<{ transaction: string; nav_per_unit: number }>("/api/bond/deposit", {
      method: "POST",
      body: JSON.stringify({ account, amount }),
    }),
  donateTx: (account: string, amount: number) =>
    chain<{ transaction: string }>("/api/readiness/fund", { method: "POST", body: JSON.stringify({ account, amount }) }),
  donateSubmit: (transaction: string) =>
    chain<{ signature: string; confirmed: boolean }>("/api/readiness/submit", { method: "POST", body: JSON.stringify({ transaction }) }),
  bondSubmit: (transaction: string) =>
    chain<{ signature: string }>("/api/bond/submit", { method: "POST", body: JSON.stringify({ transaction }) }),
};
