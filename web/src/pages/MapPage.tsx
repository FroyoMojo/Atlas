import { useState } from "react";
import { CircleMarker, MapContainer, TileLayer, Tooltip } from "react-leaflet";
import { Link, useNavigate } from "react-router-dom";
import { getAdminToken } from "../admin";
import { api } from "../api";
import { areaOf, STATUS_COLOR } from "../areas";
import { Contours, Level, Pill, WaveIcon } from "../components/ui";
import { usePoll } from "../usePoll";
import { fmtDateTime, fmtDay, fmtTime, fmtWeekday, useReplay } from "../useReplay";

export function MapPage() {
  const navigate = useNavigate();
  const { replay, runId, isReplay, historic, progress } = useReplay();
  const { data: gauges, error } = usePoll(() => api.gauges(runId), 1000, [runId]);
  const { data: storms } = usePoll(() => api.storms(runId), 1500, [runId]);
  const [adminError, setAdminError] = useState<string | null>(null);
  const isAdmin = !!getAdminToken();

  const covered = gauges?.filter((g) => g.demo_ready) ?? [];
  const flooding = covered.filter((g) => g.status === "triggered").length;
  const households = new Set(storms?.flatMap((s) => s.payouts.map((p) => p.policy)) ?? []).size;
  const gaugeById = (id: string) => gauges?.find((g) => g.gauge_id === id);

  // Live feed, newest first: one line per flooded area, with what was sent there.
  const feed =
    storms
      ?.flatMap((s) =>
        s.events.map((e) => {
          const { area, river } = areaOf(gaugeById(e.gauge_id), e.gauge_id);
          const sent = s.payouts.length;
          return {
            key: e.event_id,
            at: historic(e.opened_at),
            text: (
              <>
                Flooding in <strong>{area}</strong>: {river} reached {e.value.toFixed(1)} ft.
                {s.events[0]?.event_id === e.event_id && sent > 0 && ` ${sent} payment${sent === 1 ? "" : "s"} sent this storm.`}
              </>
            ),
          };
        }),
      )
      .sort((a, b) => (b.at?.getTime() ?? 0) - (a.at?.getTime() ?? 0)) ?? [];

  const act = (fn: () => Promise<unknown>) => () =>
    fn().then(() => setAdminError(null)).catch((e) => setAdminError(String(e.message ?? e)));

  const clock = historic(replay?.clock);
  const startDay = isReplay && replay?.started_wall && replay.shift_seconds != null
    ? new Date(Date.parse(replay.started_wall) - replay.shift_seconds * 1000)
    : null;

  return (
    <>
      <div className="hero pad-big">
        <Contours />
        <section className="hero-body">
          <span className="eyebrow">Houston flood protection</span>
          <h1>Emergency money when your neighborhood floods.</h1>
          <p>Houston renters get $500 within minutes of a flood, for a hotel, food or a missed shift. No claim, no adjuster, no waiting weeks.</p>
        </section>
      </div>

      <section className="lift replay-card" aria-label="Replay">
        <div className="replay-id">
          <span className="replay-icon" style={{ background: isReplay ? "#FEF3F2" : "#E6F0F8" }}>
            <WaveIcon color={isReplay ? "#B42318" : "#0A3A5F"} />
          </span>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span className="replay-kicker" style={{ color: isReplay ? "#B42318" : "#0A3A5F" }}>
              {isReplay ? `Replay · Hurricane Harvey${replay?.status === "done" ? " · finished" : ""}` : "Live · USGS river gauges"}
            </span>
            <span className="replay-time">{isReplay ? fmtDateTime(clock) : "Checked every 15 minutes"}</span>
          </div>
        </div>
        {isReplay && (
          <div className="replay-bar">
            <div className="replay-track">
              <div style={{ width: `${progress * 100}%` }} />
            </div>
            <div className="replay-labels">
              <span>{fmtDay(startDay)}</span>
              <span>{Math.round(progress * 100)}% replayed</span>
            </div>
          </div>
        )}
        <div className="replay-stats">
          <div>
            <b style={{ color: flooding ? "#B42318" : "#0A3A5F" }}>{flooding} of {covered.length}</b>
            <span>areas flooding</span>
          </div>
          <div>
            <b style={{ color: "#0A3A5F" }}>{households}</b>
            <span>households paid</span>
          </div>
        </div>
        {isAdmin && (
          <div className="replay-admin">
            <button className="btn btn-primary" onClick={act(api.replayStart)} disabled={replay?.status === "running"}>
              Start replay
            </button>
            <button className="btn btn-outline" onClick={act(api.replayReset)}>Reset</button>
          </div>
        )}
        {adminError && <p className="error small" style={{ margin: 0, flexBasis: "100%" }}>{adminError}</p>}
      </section>

      <section className="roles" aria-label="Ways to take part">
        <Link to="/protect" className="lift role">
          <span className="role-tag">Households</span>
          <b>Get $500 if your river floods</b>
          <span>Pick your neighborhood, pay once for 90 days, and the payment comes to your wallet. No claim.</span>
          <span className="link-row">Get protected →</span>
        </Link>
        <Link to="/readiness" className="lift role">
          <span className="role-tag">Sponsors</span>
          <b>Fund a neighborhood's readiness</b>
          <span>Donate to a market so its payouts are fully funded before the storm. No return, and prices fall for everyone there.</span>
          <span className="link-row">See the markets →</span>
        </Link>
        <Link to="/invest" className="lift role">
          <span className="role-tag">Investors</span>
          <b>A catastrophe bond for floods</b>
          <span>Take only the remote tail of flood losses and earn T-bill interest plus a spread sized to that risk.</span>
          <span className="link-row">See the bond →</span>
        </Link>
      </section>

      <div className="map-layout">
        <div className="map-box">
          <MapContainer center={[29.83, -95.45]} zoom={10} scrollWheelZoom={false} attributionControl>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {covered.map((g) => {
              const flood = g.status === "triggered";
              const { area, river } = areaOf(g);
              return [
                flood && (
                  <CircleMarker key={`${g.gauge_id}-halo`} center={[g.lat, g.lon]} radius={26} interactive={false}
                    pathOptions={{ stroke: false, fillColor: "#B42318", fillOpacity: 0.16 }} />
                ),
                <CircleMarker
                  key={g.gauge_id}
                  center={[g.lat, g.lon]}
                  radius={10}
                  pathOptions={{ color: "#fff", weight: 3, fillColor: STATUS_COLOR[g.status], fillOpacity: 1 }}
                  eventHandlers={{ click: () => navigate(`/protect/${encodeURIComponent(g.gauge_id)}`) }}
                >
                  <Tooltip permanent direction="right" offset={[12, 0]} className="map-label">
                    {area} <small>· {river}</small>
                  </Tooltip>
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

        <aside className="side">
          <section className="card">
            <h2>Covered areas</h2>
            {error && <p className="error small">{error}</p>}
            {!gauges && !error && <p className="muted small">Loading river levels…</p>}
            {covered.map((g) => {
              const { area, river } = areaOf(g);
              return (
                <Link key={g.gauge_id} to={`/protect/${encodeURIComponent(g.gauge_id)}`} className="area">
                  <div className="area-top">
                    <span><b>{area}</b> <em>· {river}</em></span>
                    <Pill status={g.status} />
                  </div>
                  <Level gauge={g} />
                  <span className="small" style={{ color: "#667085" }}>
                    {g.latest_ft == null ? "No reading yet" : `${g.latest_ft.toFixed(1)} ft`} · flood level {g.trigger_ft} ft
                  </span>
                </Link>
              );
            })}
          </section>

          <section className="card" aria-label="Live feed" aria-live="polite">
            <h2>
              <span className="dot" style={{ background: flooding ? "#B42318" : "#079455", width: 8, height: 8 }} />
              Live
            </h2>
            {!feed.length && <p className="muted small" style={{ margin: 0 }}>All covered rivers are below flood level.</p>}
            {feed.slice(0, 5).map((f) => (
              <div key={f.key} className="feed-item">
                <time>{fmtWeekday(f.at)} {fmtTime(f.at)}</time>
                <span>{f.text}</span>
              </div>
            ))}
            <Link to="/proof" className="link-row">See where the money went, and why →</Link>
          </section>
        </aside>
      </div>
    </>
  );
}
