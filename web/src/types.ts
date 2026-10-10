// API shapes from docs/api.md. Keep in sync with Ezekiel's engine.
export type GaugeStatus = "normal" | "near" | "triggered";

export interface Gauge {
  gauge_id: string;
  name: string;
  lat: number;
  lon: number;
  trigger_ft: number;
  latest_ft: number;
  status: GaugeStatus;
}

export interface Series {
  trigger_ft: number;
  points: { time: string; stage_ft: number }[];
}

export interface Quote {
  premium: number;
  p_payout: number;
  band: [number, number];
  waiting_days: number;
  sales_open: boolean;
  reason?: string | null;
}

export interface Pool {
  onchain: { reserve: number; bond_capital: number; nav_per_unit: number; premiums_in: number; payouts_out: number };
  simulated: { policies: number; aggregate_loss: number; reserve_used: number; bond_used: number; prorata_cut: number };
}

export interface EventPayout {
  policy_mint: string;
  owner: string;
  amount: number;
  tx_sig: string;
  memo_sig: string;
}

export interface TriggerEvent {
  time: string;
  gauge_id: string;
  run_id: string;
  wave_id: string;
  reading_ft: number;
  feed_value?: number | null;
  feed_account?: string | null;
  feed_slot?: number | null;
  evidence_hash: string;
  pay_factor: number;
  payouts: EventPayout[];
}

export interface Stress {
  aggregate_loss: number;
  reserve_used: number;
  bond_used: number;
  prorata_cut: number;
  investor_loss_pct: number;
}

export interface ReplayStatus {
  run_id: string | null;
  running: boolean;
  replay_time: string | null;
}

export interface Policy {
  policy_mint: string;
  gauge_id: string;
  payout: number;
  premium: number;
  starts_at: string;
  ends_at: string;
  status: "active" | "paid" | "expired";
}
