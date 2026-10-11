// Engine (Ezekiel, read-only FastAPI) and chain service (Jesse) clients, plan v3 4.2.
// Engine calls go to the in-browser mock while VITE_USE_MOCKS=true; chain calls always go to
// the chain service.
import { getAdminToken } from "./admin";
import { config } from "./config";
import { mockEngine } from "./mockEngine";
import type { Gauge, Policy, Pool, Quote, ReplayStatus, Series, Storm, Stress } from "./types";

async function http<T>(base: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { message?: string; detail?: string }).message ?? (body as { detail?: string }).detail ?? `${path}: HTTP ${res.status}`);
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
  series: (id: string, runId: string | null): Promise<Series> =>
    config.useMocks ? mockEngine.series(id) : eng(`/gauges/${q(id)}/series${run(runId)}`),
  quote: (id: string, payout: number, runId: string | null): Promise<Quote> =>
    config.useMocks ? mockEngine.quote(id, payout) : eng(`/quote?gauge=${q(id)}&payout=${payout}${run(runId, "&")}`),
  pool: (runId: string | null): Promise<Pool> => (config.useMocks ? mockEngine.pool() : eng(`/pool${run(runId)}`)),
  storms: (runId: string | null): Promise<Storm[]> => (config.useMocks ? mockEngine.storms() : eng(`/storms${run(runId)}`)),
  stress: (scenario: "harvey" | "worst_year"): Promise<Stress> =>
    config.useMocks ? mockEngine.stress() : eng(`/stress?scenario=${scenario}`),
  replayStart: (): Promise<{ run_id: string }> => (config.useMocks ? mockEngine.replayStart() : eng("/replay/start", admin())),
  replayReset: (): Promise<{ run_id: string }> => (config.useMocks ? mockEngine.replayReset() : eng("/replay/reset", admin())),

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
  bondSubmit: (transaction: string) =>
    chain<{ signature: string }>("/api/bond/submit", { method: "POST", body: JSON.stringify({ transaction }) }),
};
