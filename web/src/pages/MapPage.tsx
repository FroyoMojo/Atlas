// The landing page: the premise in one screen. Harvey footage and the live map side by side, with the
// numbers that matter underneath. The only action is "Log in", which asks who to be in the demo.
import { useState } from "react";
import { CircleMarker, MapContainer, TileLayer, Tooltip } from "react-leaflet";
import { getAdminToken } from "../admin";
import { api } from "../api";
import { areaOf, STATUS_COLOR } from "../areas";
import { Footage } from "../components/Footage";
import { Contours } from "../components/ui";
import { useRole } from "../role";
import { usePoll } from "../usePoll";
import { fmtDateTime, useReplay } from "../useReplay";

const STEPS: [string, string][] = [
  ["Get protected", "Pick your neighborhood and $250 or $500. Pay once for 90 days."],
  ["The river decides", "When the USGS gauge by your home stays at flood level for two readings, a payment is triggered. No claim."],
  ["Money arrives", "Within minutes, to your wallet. Nobody approves it by hand."],
];

export function MapPage() {
  const { openPanel, role } = useRole();
  const { replay, runId, isReplay, historic, progress } = useReplay();
  const { data: gauges } = usePoll(() => api.gauges(runId), 1000, [runId]);
  const { data: storms } = usePoll(() => api.storms(runId), 1500, [runId]);
  const [adminError, setAdminError] = useState<string | null>(null);
  const isAdmin = !!getAdminToken();

  const covered = gauges?.filter((g) => g.demo_ready) ?? [];
  const flooding = covered.filter((g) => g.status === "triggered").length;
  const households = new Set(storms?.flatMap((s) => s.payouts.map((p) => p.policy)) ?? []).size;

  const act = (fn: () => Promise<unknown>) => () =>
    fn().then(() => setAdminError(null)).catch((e) => setAdminError(String(e.message ?? e)));

  return (
    <>
      <div className="hero pad-big">
        <Contours />
        <section className="hero-body">
          <span className="eyebrow">Houston flood protection</span>
          <h1>$500 within minutes of a flood.</h1>
          <p>For a hotel, food or a missed shift. No claim, no adjuster, no waiting weeks. Paid automatically when your river crosses flood level.</p>
          <button className="btn btn-white hero-cta" onClick={() => openPanel("signin")}>
            {role ? "Switch person" : "Log in to try the demo"}
          </button>
        </section>
      </div>

      <section className="stage lift" aria-label="Live">
        <div className="stage-head">
          <span className="stage-kicker">
            <i className="dot" style={{ background: flooding ? "#D92D20" : "#079455" }} />
            {isReplay ? `Replay · Hurricane Harvey · ${fmtDateTime(historic(replay?.clock))}` : "Live · USGS river gauges"}
          </span>
          <div className="stage-stats">
            <div>
              <b style={{ color: flooding ? "#B42318" : "#0A3A5F" }}>{flooding} of {covered.length}</b>
              <span>areas flooding</span>
            </div>
            <div>
              <b>{households}</b>
              <span>households paid</span>
            </div>
          </div>
        </div>
        {isReplay && (
          <div className="replay-track" aria-label={`${Math.round(progress * 100)}% replayed`}>
            <div style={{ width: `${progress * 100}%` }} />
          </div>
        )}
        <div className="stage-grid">
          <Footage flooding={flooding > 0} />
          <div className="map-box">
            <MapContainer center={[29.83, -95.45]} zoom={10} scrollWheelZoom={false} attributionControl>
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {covered.map((g) => {
                const flood = g.status === "triggered";
                const { area } = areaOf(g);
                return [
                  flood && (
                    <CircleMarker key={`${g.gauge_id}-halo`} center={[g.lat, g.lon]} radius={26} interactive={false}
                      pathOptions={{ stroke: false, fillColor: "#B42318", fillOpacity: 0.16 }} />
                  ),
                  <CircleMarker key={g.gauge_id} center={[g.lat, g.lon]} radius={10}
                    pathOptions={{ color: "#fff", weight: 3, fillColor: STATUS_COLOR[g.status], fillOpacity: 1 }}>
                    <Tooltip permanent direction="right" offset={[12, 0]} className="map-label">{area}</Tooltip>
                  </CircleMarker>,
                ];
              })}
            </MapContainer>
            <div className="map-legend">
              <span><i className="dot" style={{ background: STATUS_COLOR.normal }} />Normal</span>
              <span><i className="dot" style={{ background: STATUS_COLOR.near }} />Rising</span>
              <span><i className="dot" style={{ background: STATUS_COLOR.triggered }} />Flooding</span>
            </div>
          </div>
        </div>
        {isAdmin && (
          <div className="replay-admin">
            <button className="btn btn-primary" onClick={act(api.replayStart)} disabled={replay?.status === "running"}>Start replay</button>
            <button className="btn btn-outline" onClick={act(api.replayReset)}>Reset</button>
            {adminError && <span className="error small">{adminError}</span>}
          </div>
        )}
      </section>

      <section className="how" aria-label="How it works">
        {STEPS.map(([t, d], i) => (
          <div key={t}>
            <span className="num">{i + 1}</span>
            <h3>{t}</h3>
            <p>{d}</p>
          </div>
        ))}
        <p className="how-note">A fixed emergency payment, not property insurance. In danger? Call 911 and never drive through water.</p>
      </section>
    </>
  );
}
