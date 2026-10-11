// Readiness (docs/readiness.md): how much of each promised payout is funded right now, where the
// money comes from, and a Fund readiness button for sponsors.
import { useWallet } from "@solana/wallet-adapter-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { areaOf } from "../areas";
import { explorer } from "../config";
import { friendlyError } from "../errors";
import { useRole } from "../role";
import { Contours, price, usd } from "../components/ui";
import type { ReadinessMarket } from "../types";
import { usePoll } from "../usePoll";
import { useConnectWallet, useServerTx } from "../wallet";

const pct = (r: number) => `${Math.round(r * 100)}%`;
const GRADE_STYLE: Record<string, { bg: string; fg: string }> = {
  A: { bg: "#E6F0F8", fg: "#0A3A5F" },
  B: { bg: "#FEF0C7", fg: "#93370D" },
  C: { bg: "#F2F4F7", fg: "#475467" },
};

export function ReadinessPage() {
  const { data, error } = usePoll(api.readiness, 3000);
  const pool = data?.pool;
  const live = data?.markets.filter((m) => !m.simulated) ?? [];
  const sim = data?.markets.filter((m) => m.simulated) ?? [];
  const funding = pool
    ? [
        { label: "Seed reserve", value: pool.funding.seed_reserve, color: "#0A3A5F" },
        { label: "Household premiums", value: pool.funding.household_premiums, color: "#2C6593" },
        { label: "Sponsor donations", value: pool.funding.sponsor_donations, color: "#079455" },
        { label: "Outside capital (bond)", value: pool.funding.outside_capital, color: "#8CC4F0" },
      ]
    : [];
  const fundTotal = funding.reduce((s, f) => s + Math.max(0, f.value), 0);
  // Nothing sold: readiness reads 100% for any pool, so say what the pool can fully fund instead.
  const nothingSold = !!pool && pool.owed_usd === 0;

  return (
    <>
      <div className="hero pad-mid">
        <Contours />
        <section className="hero-body center">
          <span className="eyebrow">Markets · for sponsors</span>
          <h1 className="h1-page">Fund the neighborhoods before the flood.</h1>
          <p>Each market shows how much of its promised $500 is funded today. Houston's covered areas share one community fund: money you donate raises that share and lowers the price for every household. It is a gift: no return, no units.</p>
        </section>
      </div>

      <div className="page">
        <section className="lift money-card" aria-live="polite">
          <div>
            <span>Houston pool is</span>
            <span className="big-num num-lg" style={{ color: pool && pool.readiness < 1 ? "#B54708" : "#0A3A5F" }}>
              {pool ? (nothingSold ? "open" : `${pct(pool.readiness)} ready`) : "–"}
            </span>
          </div>
          <div>
            <span>{nothingSold ? "No cover sold yet. The pool can fully fund" : "If a flood hit now, each household gets"}</span>
            <span className="big-num num-lg">
              {pool ? (nothingSold ? `${usd(pool.fully_funded_cover_usd ?? pool.funds_usd)} of cover` : `${usd(pool.payout_if_fired_per_500)} of $500`) : "–"}
            </span>
          </div>
          <FundButton />
          {error && <p className="error small" style={{ flexBasis: "100%", margin: 0 }}>{error}</p>}
        </section>

        {pool && (
          <section className="stack">
            <h2 className="section-title" style={{ fontSize: 22 }}>Where the money comes from</h2>
            <div className="card harvey">
              <div className="harvey-bar" style={{ height: 18 }} role="img" aria-label="Funding sources">
                {funding.map((f) => (
                  <div key={f.label} style={{ width: `${fundTotal ? (Math.max(0, f.value) / fundTotal) * 100 : 0}%`, background: f.color }} />
                ))}
              </div>
              <div className="harvey-legend" style={{ gap: "8px 24px" }}>
                {funding.map((f) => (
                  <span key={f.label}><i className="dot" style={{ background: f.color }} />{f.label} <b style={{ color: "#101828" }}>{usd(f.value)}</b></span>
                ))}
              </div>
              <span className="small muted">
                {usd(pool.funds_usd)} stands behind {usd(pool.owed_usd)} of promised payouts. Only community money
                (seed reserve, premiums, donations) lowers the price; bond capital expects a return.
              </span>
            </div>
          </section>
        )}

        <section className="stack">
          <h2 className="section-title" style={{ fontSize: 22 }}>Live markets</h2>
          {!data && !error && <p className="muted">Loading markets…</p>}
          <div className="market-grid">{live.map((m) => <MarketCard key={m.market_id} m={m} />)}</div>
        </section>

        {sim.length > 0 && (
          <section className="stack">
            <h2 className="section-title" style={{ fontSize: 22 }}>Next markets <span className="muted" style={{ fontSize: 15, fontWeight: 500 }}>simulated, nothing sold</span></h2>
            <div className="market-grid">{sim.map((m) => <MarketCard key={m.market_id} m={m} />)}</div>
          </section>
        )}

        <p className="small muted" style={{ margin: 0 }}>
          Live in Houston? <Link to="/protect">Get protected</Link>. Want a return for carrying risk? <Link to="/invest">Invest in the bond</Link>.
        </p>
      </div>
    </>
  );
}

function MarketCard({ m }: { m: ReadinessMarket }) {
  const { area, river } = m.simulated ? simulatedLabel(m) : areaOf({ gauge_id: m.market_id, name: m.name });
  const g = GRADE_STYLE[m.grade] ?? GRADE_STYLE.C;
  const color = m.readiness >= 0.999 ? "#079455" : m.readiness >= 0.5 ? "#B54708" : "#B42318";
  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <b style={{ fontSize: 16 }}>{area}</b>
          <span className="small" style={{ color: "#667085" }}>{river}</span>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {m.simulated && <span className="pill pill-normal">Simulated</span>}
          <span className="pill" style={{ background: g.bg, color: g.fg }} title={m.grade_reasons.join("; ")}>Grade {m.grade}</span>
        </div>
      </div>
      {m.simulated ? (
        <>
          <span style={{ fontSize: 15 }}>Not launched. <b>{usd(m.gap_usd)}</b> to launch ({m.households_assumed ?? 500} households × $500).</span>
          <span className="small muted">{m.grade_reasons[0]}</span>
        </>
      ) : (
        <>
          <div className="level" style={{ height: 8 }}>
            <div style={{ width: `${m.readiness * 100}%`, background: color }} />
          </div>
          <span style={{ fontSize: 15 }}>
            <b>{usd(m.expected_payout_per_500)} of $500</b> would be paid today ({pct(m.readiness)} ready).
          </span>
          {m.gap_usd > 0.5 && (
            <span className="small muted">
              Gap: {usd(m.gap_usd)}{m.gap_per_household != null ? ` (${usd(m.gap_per_household)} per household)` : ""}
            </span>
          )}
        </>
      )}
      {m.grade === "C" ? (
        <div style={{ borderTop: "1px solid #E4E7EC", paddingTop: 10 }} className="small muted">Not offered: the record doesn't support a fair price.</div>
      ) : (
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, borderTop: "1px solid #E4E7EC", paddingTop: 10 }}>
        <span className="small muted" style={{ whiteSpace: "nowrap" }}>$500, 90 days</span>
        <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
          <b style={{ fontFamily: "var(--display)", fontSize: 20 }}>{price(m.price_now)}</b>
          {m.price_if_ready < m.price_now - 0.005 && <span className="small muted">{price(m.price_if_ready)} when fully ready</span>}
        </span>
      </div>
      )}
      {!m.simulated && <Link to={`/protect/${encodeURIComponent(m.market_id)}`} className="small muted">Live here? Get protected →</Link>}
    </div>
  );
}

/** "North Carolina: Neuse River at Kinston" -> place "Neuse River at Kinston", state "North Carolina". */
function simulatedLabel(m: ReadinessMarket): { area: string; river: string } {
  const [state, place] = (m.region ?? "").includes(":") ? (m.region ?? "").split(/:\s*/, 2) : [m.region ?? "", ""];
  const name = place || m.name;
  const tidy = name === name.toUpperCase() ? name.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : name;
  return { area: tidy, river: state };
}

function FundButton() {
  const { role, setRole } = useRole();
  const { publicKey } = useWallet();
  const connectWallet = useConnectWallet();
  const { donate } = useServerTx();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(1000);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; sig?: string } | null>(null);

  async function send() {
    if (!publicKey) return connectWallet();
    setBusy(true);
    setMsg(null);
    try {
      const { transaction } = await api.donateTx(publicKey.toBase58(), amount);
      const sig = await donate(transaction);
      if (!role) setRole("sponsor");
      setMsg({ ok: true, text: `Thank you: ${usd(amount)} added to the pool. Readiness updates within a few seconds.`, sig });
      setOpen(false);
    } catch (e) {
      setMsg({ ok: false, text: friendlyError(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: "1 1 260px" }}>
      {open ? (
        <div className="payout-row" style={{ flexWrap: "nowrap" }}>
          <input className="input" style={{ width: 120 }} type="number" min={1} value={amount} onChange={(e) => setAmount(Number(e.target.value))} aria-label="Amount to donate" />
          <button className="btn btn-primary" onClick={send} disabled={busy || !(amount > 0)}>
            {busy ? "Confirm in wallet…" : publicKey ? "Donate" : "Connect wallet"}
          </button>
        </div>
      ) : (
        <button className="btn btn-primary" onClick={() => setOpen(true)}>Fund readiness</button>
      )}
      <span className="small muted">A donation, not an investment. It sits in the reserve and pays households first, ahead of bond investors.</span>
      {msg && (
        <span className={`small ${msg.ok ? "" : "error"}`} style={msg.ok ? { color: "#067647" } : undefined}>
          {msg.text} {msg.sig && <a href={explorer(msg.sig)} target="_blank" rel="noreferrer">View</a>}
        </span>
      )}
    </div>
  );
}
