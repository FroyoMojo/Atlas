// Calls into Ezekiel's engine (FastAPI). Shapes follow docs/api.md.
import { env } from "./env.js";

export interface Quote {
  premium: number;
  p_payout: number;
  band: [number, number];
  k?: number;
  waiting_days: number;
  sales_open: boolean;
  reason?: string | null;
}

export class EngineError extends Error {
  constructor(message: string, readonly status: number | null) {
    super(message);
  }
}

async function getJson<T>(path: string, timeoutMs = 4_000): Promise<T> {
  let res: globalThis.Response;
  try {
    res = await fetch(`${env.engineUrl}${path}`, { signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    throw new EngineError(`engine ${path}: ${String(err)}`, null); // unreachable or timed out
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { detail?: unknown };
    throw new EngineError(`engine ${path}: HTTP ${res.status} ${typeof body.detail === "string" ? body.detail : ""}`.trim(), res.status);
  }
  return (await res.json()) as T;
}

/** Quote from the engine. In demo mode, falls back to a fixed premium if the engine is down. */
export async function getQuote(gaugeId: string, payout: number): Promise<Quote & { fallback: boolean }> {
  try {
    const q = await getJson<Quote>(`/quote?gauge=${encodeURIComponent(gaugeId)}&payout=${payout}`);
    return { ...q, fallback: false };
  } catch (err) {
    // Fall back only when the engine is down (network error or 5xx), never on a 4xx: a rejected
    // request (bad gauge or payout) must not be sold at the fallback premium.
    const down = err instanceof EngineError && (err.status === null || err.status >= 500);
    if (!env.demoMode || !down) throw err;
    return {
      premium: env.fallbackPremium,
      p_payout: 0,
      band: [env.fallbackPremium, env.fallbackPremium],
      waiting_days: 0,
      sales_open: true,
      reason: "engine unreachable: demo fallback premium",
      fallback: true,
    };
  }
}

/** Bond NAV per unit from the engine's /pool (plan v3 7.4). null if unavailable: never guess a NAV. */
export async function getNavPerUnit(): Promise<number | null> {
  try {
    const pool = await getJson<{ onchain?: { nav_per_unit?: number } }>("/pool", 12_000);
    const nav = pool.onchain?.nav_per_unit;
    return typeof nav === "number" && Number.isFinite(nav) && nav > 0 ? nav : null;
  } catch {
    return null;
  }
}
