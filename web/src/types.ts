// API shapes from docs/api.md (plan v3 section 4.2). Keep in sync with Ezekiel's engine.
export type GaugeStatus = "normal" | "near" | "triggered";

export interface Gauge {
  gauge_id: string;
  name: string;
  lat: number;
  lon: number;
  trigger_ft: number;
  latest_ft: number | null; // null until the gauge has a reading
  status: GaugeStatus;
  demo_ready: boolean;
}

export interface Series {
  points: { event_time: string; stage_ft: number }[];
  trigger_ft: number;
  rejected_count: number;
}

export interface Quote {
  premium: number;
  p_payout: number;
  band: [number, number];
  k: number;
  waiting_days: number;
  sales_open: boolean;
  reason?: string | null;
}

export interface Pool {
  onchain: {
    seeded_capital: number;
    premiums_in: number;
    reserve: number;
    bond_capital: number;
    float: number;
    nav_per_unit: number;
    payouts_out: number;
    reconciled: boolean;
  };
  simulated: {
    policies: number;
    worst_year_loss: number;
    harvey_loss: number;
    reserve_used: number;
    bond_used: number;
    f_int: number;
    f_fin: number;
    investor_loss_pct: number;
  };
}

export interface StormEvent {
  event_id: string;
  gauge_id: string;
  opened_at: string;
  closed_at: string | null;
  value: number;
  evidence_hash: string;
  preimage: string;
}

export interface StormPayout {
  policy: string;
  kind: "interim" | "trueup";
  amount: number;
  tx_sig: string;
}

export interface Storm {
  storm_id: string;
  status: "open" | "closed" | "trued_up";
  f_int: number | null;
  f_fin: number | null;
  events: StormEvent[];
  payouts: StormPayout[];
}

export interface Stress {
  aggregate_loss: number;
  reserve_used: number;
  bond_used: number;
  f_fin: number;
  investor_loss_pct: number;
}

/** GET /replay/status: not in the v3 table but needed by every page (proposed addition). */
export interface ReplayStatus {
  run_id: string | null;
  status: "running" | "done" | "reset" | null;
  clock: string | null;
}

export interface Policy {
  policy_mint: string;
  gauge_id: string;
  gauge_name: string | null;
  payout: number;
  premium: number;
  starts_at: string;
  ends_at: string;
  status: "ACTV" | "PAID" | "EXPD";
  paid_amount: number;
  last_payout: { amount: number; kind: "interim" | "trueup"; tx_sig: string; at: string } | null;
}
