// In-browser stand-in for Ezekiel's engine, used while VITE_USE_MOCKS=true.
// Animates a fake 90-second flood so every page can be built and rehearsed early.
import gaugesRaw from "../mocks/gauges.json";
import poolRaw from "../mocks/pool.json";
import stressRaw from "../mocks/stress.json";
import type { Gauge, Pool, Quote, ReplayStatus, Series, Stress, TriggerEvent } from "./types";

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
        return { gauge_id: g.gauge_id, name: g.name, lat: g.lat, lon: g.lon, trigger_ft: g.trigger_ft, latest_ft: latest, status };
      }),
    );
  },

  async series(gaugeId: string): Promise<Series> {
    const g = gauges.find((x) => x.gauge_id === gaugeId) ?? gauges[0];
    const t = progress();
    const points = runId
      ? steps(t).map((s) => ({ time: replayTime(s).toISOString(), stage_ft: stageAt(g, s) }))
      : Array.from({ length: 48 }, (_, i) => ({
          time: new Date(Date.now() - (47 - i) * 3600_000).toISOString(),
          stage_ft: g.base_ft + Math.sin(i / 5) * 0.6,
        }));
    return delay({ trigger_ft: g.trigger_ft, points });
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
      waiting_days: 0,
      sales_open: !anyTriggered,
      reason: anyTriggered ? "Flood warning active at this gauge (mock)" : null,
    });
  },

  async events(): Promise<TriggerEvent[]> {
    if (!runId) return delay([]);
    const t = progress();
    const out: TriggerEvent[] = [];
    for (const g of gauges) {
      const c = crossing(g, t);
      if (c === null) continue;
      out.push({
        time: replayTime(c).toISOString(),
        gauge_id: g.gauge_id,
        run_id: runId,
        wave_id: `w${Math.round(c * 20)}`,
        reading_ft: stageAt(g, c),
        evidence_hash: "0".repeat(64),
        pay_factor: 1,
        payouts: [],
      });
    }
    return delay(out.sort((a, b) => a.time.localeCompare(b.time)));
  },

  async pool(): Promise<Pool> {
    const pool = structuredClone(poolRaw) as Pool;
    const triggered = runId ? gauges.filter((g) => crossing(g, progress()) !== null).length : 0;
    const paid = triggered * 500;
    pool.onchain.payouts_out = paid;
    const fromReserve = Math.min(paid, pool.onchain.reserve);
    const fromBond = Math.min(paid - fromReserve, pool.onchain.bond_capital);
    pool.onchain.reserve -= fromReserve;
    pool.onchain.nav_per_unit = (pool.onchain.bond_capital - fromBond) / pool.onchain.bond_capital;
    pool.onchain.bond_capital -= fromBond;
    const share = triggered / gauges.length;
    pool.simulated.aggregate_loss = Math.round((stressRaw as Stress).aggregate_loss * share);
    pool.simulated.reserve_used = Math.round((stressRaw as Stress).reserve_used * Math.min(1, share * 2));
    pool.simulated.bond_used = Math.round((stressRaw as Stress).bond_used * share);
    pool.simulated.prorata_cut = share > 0.6 ? (stressRaw as Stress).prorata_cut : 0;
    return delay(pool);
  },

  async stress(): Promise<Stress> {
    return delay(stressRaw as Stress);
  },

  async replayStatus(): Promise<ReplayStatus> {
    const t = progress();
    return delay({ run_id: runId, running: runId !== null && t < 1, replay_time: runId ? replayTime(t).toISOString() : null });
  },

  async replayStart(): Promise<{ run_id: string }> {
    runId = `mock-${Date.now().toString(36)}`;
    startedAt = Date.now();
    return delay({ run_id: runId });
  },

  async replayReset(): Promise<{ ok: boolean }> {
    runId = null;
    return delay({ ok: true });
  },
};
