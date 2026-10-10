// In-browser stand-in for Ezekiel's engine, used while VITE_USE_MOCKS=true.
// Animates a fake 90-second flood so every page can be built and rehearsed early.
import gaugesRaw from "../mocks/gauges.json";
import poolRaw from "../mocks/pool.json";
import stressRaw from "../mocks/stress.json";
import type { Gauge, Pool, Quote, ReplayStatus, Series, Storm, Stress } from "./types";

interface MockGauge {
  gauge_id: string;
  name: string;
  lat: number;
  lon: number;
  trigger_ft: number;
  peak_ft: number;
  base_ft: number;
  peak_at: number;
}

const gauges = gaugesRaw as MockGauge[];
const REPLAY_SECONDS = 90;
const WINDOW_HOURS = 108; // about 4.5 days of flood squeezed into 90 seconds
const STEP_MIN = 15;

let runId: string | null = null;
let startedAt = 0;

function progress(): number {
  if (!runId) return 0;
  return Math.min(1, (Date.now() - startedAt) / (REPLAY_SECONDS * 1000));
}

function stageAt(g: MockGauge, t: number): number {
  const width = 0.16;
  const x = (t - g.peak_at) / width;
  return g.base_ft + (g.peak_ft - g.base_ft) * Math.exp(-x * x);
}

function replayTime(t: number): Date {
  return new Date(startedAt + t * WINDOW_HOURS * 3600_000);
}

function steps(upTo: number): number[] {
  const n = Math.floor((upTo * WINDOW_HOURS * 60) / STEP_MIN);
  return Array.from({ length: n + 1 }, (_, i) => (i * STEP_MIN) / (WINDOW_HOURS * 60));
}

/** First replay fraction at which two consecutive readings are at or above the trigger. */
function crossing(g: MockGauge, upTo: number): number | null {
  const s = steps(upTo);
  for (let i = 1; i < s.length; i++) {
    if (stageAt(g, s[i - 1]) >= g.trigger_ft && stageAt(g, s[i]) >= g.trigger_ft) return s[i];
  }
  return null;
}

const delay = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(structuredClone(v)), 120));

export const mockEngine = {
  async gauges(): Promise<Gauge[]> {
    const t = progress();
    return delay(
      gauges.map((g) => {
        const latest = runId ? stageAt(g, t) : g.base_ft;
        const status = runId && crossing(g, t) !== null ? "triggered" : latest >= g.trigger_ft * 0.9 ? "near" : "normal";
        return {
          gauge_id: g.gauge_id, name: g.name, lat: g.lat, lon: g.lon, trigger_ft: g.trigger_ft,
          latest_ft: latest, status, demo_ready: g.peak_ft >= g.trigger_ft,
        };
      }),
    );
  },

  async series(gaugeId: string): Promise<Series> {
    const g = gauges.find((x) => x.gauge_id === gaugeId) ?? gauges[0];
    const t = progress();
    const points = runId
      ? steps(t).map((s) => ({ event_time: replayTime(s).toISOString(), stage_ft: stageAt(g, s) }))
      : Array.from({ length: 48 }, (_, i) => ({
          event_time: new Date(Date.now() - (47 - i) * 3600_000).toISOString(),
          stage_ft: g.base_ft + Math.sin(i / 5) * 0.6,
        }));
    return delay({ trigger_ft: g.trigger_ft, points, rejected_count: runId ? 2 : 0 });
  },

  async quote(gaugeId: string, payout: number): Promise<Quote> {
    const g = gauges.find((x) => x.gauge_id === gaugeId) ?? gauges[0];
    const lambda = 0.06 + (g.peak_ft - g.trigger_ft > 0 ? 0.04 : 0);
    const p = 1 - Math.exp(-lambda);
    const premium = p * payout * 1.35 + 4;
    const anyTriggered = runId !== null && crossing(g, progress()) !== null;
    return delay({
      premium,
      p_payout: p,
      band: [premium * 0.7, premium * 1.45] as [number, number],
      k: payout * 0.55, // k_i = K B_i / sum B (plan 7.3), in aUSD
      waiting_days: 0,
      sales_open: !anyTriggered,
      reason: anyTriggered ? "Flood warning active at this gauge (mock)" : null,
    });
  },

  async storms(): Promise<Storm[]> {
    if (!runId) return delay([]);
    const t = progress();
    const events = gauges
      .map((g) => ({ g, c: crossing(g, t) }))
      .filter((x): x is { g: MockGauge; c: number } => x.c !== null)
      .map(({ g, c }) => {
        const opened = replayTime(c).toISOString().replace(/\.\d{3}Z$/, "Z");
        return {
          event_id: `${runId}-${g.gauge_id}`,
          gauge_id: g.gauge_id,
          opened_at: opened,
          closed_at: t >= 1 ? replayTime(1).toISOString() : null,
          value: stageAt(g, c),
          evidence_hash: "0".repeat(64),
          preimage: `atlas|v3|${g.gauge_id}|${stageAt(g, c).toFixed(2)}|${opened}|${runId}|${runId}-s1|${runId}-${g.gauge_id}|-|-`,
        };
      });
    if (!events.length) return delay([]);
    const closed = t >= 1;
    return delay([
      { storm_id: `${runId}-s1`, status: closed ? "closed" : "open", f_int: 1, f_fin: closed ? 1 : null, events, payouts: [] },
    ] as Storm[]);
  },

  async pool(): Promise<Pool> {
    const pool = structuredClone(poolRaw) as Pool;
    const triggered = runId ? gauges.filter((g) => crossing(g, progress()) !== null).length : 0;
    const paid = triggered * 500;
    pool.onchain.payouts_out = paid;
    pool.onchain.float = Math.max(0, pool.onchain.float - paid);
    const fromReserve = Math.min(paid, pool.onchain.reserve);
    const fromBond = Math.min(paid - fromReserve, pool.onchain.bond_capital);
    pool.onchain.reserve -= fromReserve;
    pool.onchain.nav_per_unit = (pool.onchain.bond_capital - fromBond) / pool.onchain.bond_capital;
    pool.onchain.bond_capital -= fromBond;
    const share = triggered / gauges.length;
    const stress = stressRaw as Stress;
    pool.simulated.harvey_loss = Math.round(stress.aggregate_loss * share);
    pool.simulated.worst_year_loss = 540000;
    pool.simulated.reserve_used = Math.round(stress.reserve_used * Math.min(1, share * 2));
    pool.simulated.bond_used = Math.round(stress.bond_used * share);
    pool.simulated.f_int = share > 0 ? 0.62 : 1;
    pool.simulated.f_fin = progress() >= 1 && share > 0 ? stress.f_fin : pool.simulated.f_int;
    pool.simulated.investor_loss_pct = Math.round(stress.investor_loss_pct * share);
    return delay(pool);
  },

  async stress(): Promise<Stress> {
    return delay(stressRaw as Stress);
  },

  async replayStatus(): Promise<ReplayStatus> {
    const t = progress();
    return delay({
      run_id: runId,
      status: runId ? (t < 1 ? "running" : "done") : null,
      clock: runId ? replayTime(t).toISOString() : null,
    } as ReplayStatus);
  },

  async replayStart(): Promise<{ run_id: string }> {
    runId = `mock-${Date.now().toString(36)}`;
    startedAt = Date.now();
    return delay({ run_id: runId });
  },

  async replayReset(): Promise<{ run_id: string }> {
    const old = runId ?? "none";
    runId = null;
    return delay({ run_id: old });
  },
};
