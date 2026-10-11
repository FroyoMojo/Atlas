// Covered areas: which neighborhood each demo gauge watches, and the address lookup on the
// "Get protected" page. A demo lookup by ZIP or neighborhood name, not a geocoder.
import type { Gauge, GaugeStatus } from "./types";

export interface Area {
  gauge_id: string;
  area: string; // the neighborhood people know
  river: string; // the water the gauge sits on
  match: string[]; // ZIPs and names that resolve to this area (lowercase)
}

export const AREAS: Area[] = [
  { gauge_id: "08075000", area: "Meyerland", river: "Brays Bayou", match: ["77096", "77025", "77035", "77401", "meyerland", "bellaire", "braeswood"] },
  { gauge_id: "08073700", area: "Memorial", river: "Buffalo Bayou", match: ["77024", "77079", "77057", "memorial", "piney point"] },
  { gauge_id: "08069000", area: "Westfield", river: "Cypress Creek", match: ["77090", "77068", "77014", "westfield", "cypresswood"] },
  { gauge_id: "08068500", area: "Spring", river: "Spring Creek", match: ["77373", "77379", "77389", "77386", "spring"] },
  // Mock engine gauges (VITE_USE_MOCKS=true)
  { gauge_id: "demo-brays", area: "Meyerland", river: "Brays Bayou", match: ["77096", "77025", "77035", "meyerland", "bellaire"] },
  { gauge_id: "demo-buffalo", area: "Memorial", river: "Buffalo Bayou", match: ["77024", "77079", "memorial"] },
  { gauge_id: "demo-whiteoak", area: "The Heights", river: "White Oak Bayou", match: ["77008", "77007", "heights"] },
  { gauge_id: "demo-greens", area: "Aldine", river: "Greens Bayou", match: ["77039", "77032", "aldine"] },
  { gauge_id: "demo-sims", area: "South Park", river: "Sims Bayou", match: ["77033", "77087", "south park"] },
  { gauge_id: "demo-cypress", area: "Westfield", river: "Cypress Creek", match: ["77090", "77068", "westfield"] },
];

export function areaOf(g: Pick<Gauge, "gauge_id" | "name"> | null | undefined, fallbackId?: string): { area: string; river: string } {
  const id = g?.gauge_id ?? fallbackId ?? "";
  const known = AREAS.find((a) => a.gauge_id === id);
  if (known) return known;
  const name = (g?.name ?? id).replace(/\s*\(mock\)\s*$/i, "");
  const river = name.split(/\s+(at|nr|near)\s+/i)[0] || name;
  return { area: river, river };
}

/** The covered gauge an address resolves to, or null if it is not covered. */
export function lookup(text: string, gauges: Gauge[]): Gauge | null {
  const q = text.trim().toLowerCase();
  if (!q) return null;
  const zip = /\b(\d{5})\b/.exec(q)?.[1];
  for (const a of AREAS) {
    const g = gauges.find((x) => x.gauge_id === a.gauge_id && x.demo_ready);
    if (!g) continue;
    if (zip ? a.match.includes(zip) : a.match.some((m) => !/^\d+$/.test(m) && q.includes(m))) return g;
  }
  return null;
}

export const STATUS_LABEL: Record<GaugeStatus, string> = { normal: "Normal", near: "Rising", triggered: "Flooding" };
export const STATUS_COLOR: Record<GaugeStatus, string> = { normal: "#98A2B3", near: "#B54708", triggered: "#B42318" };
