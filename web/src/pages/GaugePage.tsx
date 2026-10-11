import { useWallet } from "@solana/wallet-adapter-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { activeRunId, api } from "../api";
import { explorer } from "../config";
import { usePoll } from "../usePoll";
import { useServerTx } from "../wallet";

export function GaugePage() {
  const id = decodeURIComponent(useParams().id ?? "");
  const [payout, setPayout] = useState(500);
  const { data: replay } = usePoll(api.replayStatus, 1000);
  const runId = activeRunId(replay);
  const { data: gauges } = usePoll(() => api.gauges(runId), 2000, [runId]);
  const { data: series } = usePoll(() => api.series(id, runId), 1000, [id, runId]);
  const { data: quote, error: quoteError } = usePoll(() => api.quote(id, payout, runId), 3000, [id, payout, runId]);
  const { data: storms } = usePoll(() => api.storms(runId), 2000, [runId]);
  const gauge = gauges?.find((g) => g.gauge_id === id);
  const events = storms?.flatMap((s) => s.events.filter((e) => e.gauge_id === id)) ?? [];

  const { publicKey } = useWallet();
  const { purchase } = useServerTx();
  const [buying, setBuying] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string; sig?: string } | null>(null);

  async function buy() {
    if (!publicKey) return setResult({ ok: false, text: "Connect a wallet first (top right)." });
    setBuying(true);
    setResult(null);
    try {
      const { transaction, message, flow } = await api.buyTx(id, payout, publicKey.toBase58());
      const sig = await purchase(transaction, flow);
      setResult({ ok: true, text: message, sig });
    } catch (e) {
      setResult({ ok: false, text: String((e as Error).message ?? e) });
    } finally {
      setBuying(false);
    }
  }

  const data = series?.points.map((p) => ({ t: new Date(p.event_time).getTime(), ft: p.stage_ft })) ?? [];

  return (
    <div className="gauge-page">
      <p>
        <Link to="/">← Map</Link>
      </p>
      <h2>{gauge?.name ?? id}</h2>
      <div className="grid-2">
        <div className="card">
          <h3>Stage (ft), event time</h3>
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={data} margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
              <CartesianGrid stroke="#e5e7eb" vertical={false} />
              <XAxis
                dataKey="t"
                type="number"
                domain={["dataMin", "dataMax"]}
                scale="time"
                minTickGap={48}
                tickFormatter={(t) => new Date(t).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric" })}
              />
              <YAxis domain={["auto", "auto"]} width={48} />
              <Tooltip labelFormatter={(t) => new Date(t as number).toLocaleString()} formatter={(v) => [`${Number(v).toFixed(2)} ft`, "stage"]} />
              {series && (
                <ReferenceLine y={series.trigger_ft} stroke="#d23b2f" strokeDasharray="6 4" label={{ value: "trigger", position: "insideTopRight", fill: "#d23b2f" }} />
              )}
              {events.map((e) => (
                <ReferenceLine key={e.event_id} x={new Date(e.opened_at).getTime()} stroke="#d23b2f" label={{ value: "event", position: "insideTopLeft", fill: "#d23b2f" }} />
              ))}
              <Line type="monotone" dataKey="ft" stroke="#1f4e79" dot={false} strokeWidth={2} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
          <p className="muted small">
            {series ? `${series.rejected_count} reading(s) rejected by the data-quality guard.` : ""} {events.length ? `${events.length} event(s) this run.` : ""}
          </p>
        </div>

        <div className="card">
          <h3>Buy cover</h3>
          <label className="field">
            Payout
            <select value={payout} onChange={(e) => setPayout(Number(e.target.value))}>
              <option value={250}>250 aUSD</option>
              <option value={500}>500 aUSD</option>
            </select>
          </label>
          {quoteError && <p className="error">{quoteError}</p>}
          {quote && (
            <>
              <div className="big">{quote.premium.toFixed(2)} aUSD</div>
              <p className="muted">
                Covers {quote.term_days ?? 90} days · {(quote.p_payout * 100).toFixed(1)}% chance of a payout in that time ·
                90% range {quote.band[0].toFixed(2)} to {quote.band[1].toFixed(2)} aUSD · waiting period {quote.waiting_days} days
              </p>
              {!quote.sales_open && <p className="error">Sales frozen: {quote.reason}</p>}
              <button className="primary wide" disabled={!quote.sales_open || buying || !!quoteError} onClick={buy}>
                {buying ? "Confirm in your wallet…" : `Buy for ${quote.premium.toFixed(2)} aUSD`}
              </button>
            </>
          )}
          {result && (
            <p className={result.ok ? "ok" : "error"}>
              {result.text}{" "}
              {result.sig && (
                <a href={explorer(result.sig)} target="_blank" rel="noreferrer">
                  View transaction
                </a>
              )}
            </p>
          )}
          <p className="muted small">
            Pays a fixed amount if this gauge's event opens during the term. In a large storm part is paid at once and the
            rest when the storm closes. Immediate needs only; not property insurance. Devnet test money.
          </p>
        </div>
      </div>
    </div>
  );
}
