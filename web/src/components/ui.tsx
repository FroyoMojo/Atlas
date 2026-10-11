import { Link } from "react-router-dom";
import { STATUS_COLOR, STATUS_LABEL } from "../areas";
import type { Gauge, GaugeStatus } from "../types";

export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true">
      <rect x="1" y="1" width="26" height="26" rx="7" fill="#FFFFFF" />
      <path d="M5 16c3 0 3-3 6-3s3 3 6 3 3-3 6-3" fill="none" stroke="#0A3A5F" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M5 21c3 0 3-3 6-3s3 3 6 3 3-3 6-3" fill="none" stroke="#4E8BC0" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function Brand({ size }: { size?: number }) {
  return (
    <Link to="/" className="brand">
      <Logo size={size} />
      <span>Atlas</span>
    </Link>
  );
}

/** Topographic lines behind the navy hero bands. */
export function Contours() {
  return (
    <svg className="contours" viewBox="0 0 700 360" preserveAspectRatio="xMaxYMid slice" aria-hidden="true">
      {[
        "M40 300 C160 250 230 330 360 280 S560 230 700 270",
        "M60 260 C180 210 250 290 380 240 S570 190 700 230",
        "M90 220 C200 170 270 250 400 200 S580 150 700 190",
        "M130 180 C230 130 300 210 420 160 S590 110 700 150",
        "M180 140 C270 95 330 170 440 122 S600 72 700 110",
        "M240 100 C320 60 370 130 460 86 S610 36 700 70",
      ].map((d) => (
        <path key={d} d={d} fill="none" stroke="#2C6593" strokeWidth="1.5" />
      ))}
      <path d="M0 330 C140 300 220 360 340 320 S560 280 700 310" fill="none" stroke="#4E8BC0" strokeWidth="2.5" />
    </svg>
  );
}

export function Pill({ status }: { status: GaugeStatus }) {
  return <span className={`pill pill-${status}`}>{STATUS_LABEL[status]}</span>;
}

export function CheckIcon({ ok = true, size = 16 }: { ok?: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="8" fill={ok ? "#079455" : "#D92D20"} />
      {ok ? (
        <path d="M4.5 8.2l2.3 2.3 4.7-4.7" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
      )}
    </svg>
  );
}

export function WaveIcon({ color }: { color: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
      <path d="M3 13c2.5 0 2.5-2.5 5-2.5s2.5 2.5 5 2.5 2.5-2.5 5-2.5" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <path d="M3 17.5c2.5 0 2.5-2.5 5-2.5s2.5 2.5 5 2.5 2.5-2.5 5-2.5" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <path d="M11 3v5" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** River level against the flood level: the tick marks where payouts start. */
export function Level({ gauge, height = 6 }: { gauge: Gauge; height?: number }) {
  const ft = gauge.latest_ft ?? 0;
  const top = Math.max(gauge.trigger_ft * 1.12, ft);
  const fill = Math.min(100, (ft / top) * 100);
  return (
    <div className="level" style={{ height }} role="img" aria-label={`${ft.toFixed(1)} ft of ${gauge.trigger_ft} ft flood level`}>
      <div style={{ width: `${fill}%`, background: gauge.status === "normal" ? "#0A3A5F" : STATUS_COLOR[gauge.status] }} />
      <i style={{ left: `${(gauge.trigger_ft / top) * 100}%`, background: "#B42318", height: height + 8, top: -4 }} />
    </div>
  );
}

export const usd = (n: number, cents = false) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 })}`;

/** Whole dollars when the amount is whole, cents otherwise ($22, $21.73). */
export const price = (n: number) => usd(n, Math.abs(n - Math.round(n)) > 0.004);
