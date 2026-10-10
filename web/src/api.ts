// Engine (Ezekiel) and chain server (Jesse) clients. Engine calls go to the mock engine
// while VITE_USE_MOCKS=true; chain calls always hit the chain server.
import { config } from "./config";
import { mockEngine } from "./mockEngine";
import type { Gauge, Policy, Pool, Quote, ReplayStatus, Series, Stress, TriggerEvent } from "./types";

async function http<T>(base: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { message?: string }).message ?? `${path}: HTTP ${res.status}`);
  return body as T;
}

const eng = <T,>(path: string, init?: RequestInit) => http<T>(config.engineUrl, path, init);
const chain = <T,>(path: string, init?: RequestInit) => http<T>(config.chainUrl, path, init);
const q = encodeURIComponent;

export const api = {
  gauges: (): Promise<Gauge[]> => (config.useMocks ? mockEngine.gauges() : eng("/gauges")),
  series: (id: string, runId: string | null): Promise<Series> =>
    config.useMocks ? mockEngine.series(id) : eng(`/gauges/${q(id)}/series${runId ? `?run_id=${q(runId)}` : ""}`),
  quote: (id: string, payout: number): Promise<Quote> =>
    config.useMocks ? mockEngine.quote(id, payout) : eng(`/quote?gauge=${q(id)}&payout=${payout}`),
  pool: (): Promise<Pool> => (config.useMocks ? mockEngine.pool() : eng("/pool")),
  events: (runId: string | null): Promise<TriggerEvent[]> =>
    config.useMocks ? mockEngine.events() : eng(`/events${runId ? `?run_id=${q(runId)}` : ""}`),
  stress: (): Promise<Stress> => (config.useMocks ? mockEngine.stress() : eng("/stress?scenario=harvey")),
  replayStatus: (): Promise<ReplayStatus> => (config.useMocks ? mockEngine.replayStatus() : eng("/replay/status")),
  replayStart: (): Promise<{ run_id: string }> =>
    config.useMocks ? mockEngine.replayStart() : eng("/replay/start", { method: "POST" }),
  replayReset: (): Promise<{ ok: boolean }> =>
    config.useMocks ? mockEngine.replayReset() : eng("/replay/reset", { method: "POST" }),

  // Chain server
  policies: (owner: string): Promise<Policy[]> => chain(`/policies?owner=${q(owner)}`),
  buyTx: (gaugeId: string, payout: number, account: string) =>
    chain<{ transaction: string; message: string; policy_mint: string }>(
      `/api/actions/buy?gauge=${q(gaugeId)}&payout=${payout}`,
      { method: "POST", body: JSON.stringify({ account }) },
    ),
  bondDepositTx: (account: string, amount: number) =>
    chain<{ transaction: string; nav_per_unit: number }>("/api/bond/deposit", {
      method: "POST",
      body: JSON.stringify({ account, amount }),
    }),
};
