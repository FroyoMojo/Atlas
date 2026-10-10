// Calls into Ezekiel's engine (FastAPI). Shapes follow docs/api.md.
import { env } from "./env.js";

export interface Quote {
  premium: number;
  p_payout: number;
  band: [number, number];
  waiting_days: number;
  sales_open: boolean;
  reason?: string | null;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${env.engineUrl}${path}`, { signal: AbortSignal.timeout(4_000) });
  if (!res.ok) throw new Error(`engine ${path}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

/** Quote from the engine. In demo mode, falls back to a fixed premium if the engine is down. */
export async function getQuote(gaugeId: string, payout: number): Promise<Quote & { fallback: boolean }> {
  try {
    const q = await getJson<Quote>(`/quote?gauge=${encodeURIComponent(gaugeId)}&payout=${payout}`);
    return { ...q, fallback: false };
  } catch (err) {
    if (!env.demoMode) throw err;
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

/** Bond NAV per unit from the engine's /pool. 1.0 if unavailable. */
export async function getNavPerUnit(): Promise<number> {
  try {
    const pool = await getJson<{ onchain?: { nav_per_unit?: number } }>("/pool");
    return pool.onchain?.nav_per_unit ?? 1;
  } catch {
    return 1;
  }
}
