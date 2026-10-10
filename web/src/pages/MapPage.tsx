import { useState } from "react";
import { CircleMarker, MapContainer, TileLayer, Tooltip } from "react-leaflet";
import { useNavigate } from "react-router-dom";
import { getAdminToken } from "../admin";
import { api } from "../api";
import type { GaugeStatus } from "../types";
import { usePoll } from "../usePoll";

const COLORS: Record<GaugeStatus, string> = { normal: "#2e9e5b", near: "#d99a0b", triggered: "#d23b2f" };

export function MapPage() {
  const navigate = useNavigate();
  const { data: replay } = usePoll(api.replayStatus, 1000);
  const runId = replay?.run_id ?? null;
  const { data: gauges, error } = usePoll(() => api.gauges(runId), 1000, [runId]);
  const { data: storms } = usePoll(() => api.storms(runId), 1500, [runId]);
  const [adminError, setAdminError] = useState<string | null>(null);
  const isAdmin = !!getAdminToken();
  const nameOf = (id: string) => gauges?.find((g) => g.gauge_id === id)?.name ?? id;

  const act = (fn: () => Promise<unknown>) => () => fn().then(() => setAdminError(null)).catch((e) => setAdminError(String(e.message ?? e)));

  return (
    <div className="map-page">
      <section className="map-wrap">
        <MapContainer center={[29.8, -95.37]} zoom={10} className="map">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {gauges?.map((g) => (
            <CircleMarker
              key={g.gauge_id}
              center={[g.lat, g.lon]}
              radius={g.status === "triggered" ? 16 : 11}
              pathOptions={{ color: COLORS[g.status], fillColor: COLORS[g.status], fillOpacity: 0.65, weight: g.demo_ready ? 3 : 1 }}
              eventHandlers={{ click: () => navigate(`/gauge/${encodeURIComponent(g.gauge_id)}`) }}
            >
              <Tooltip>
                <b>{g.name}</b>
                <br />
                {g.latest_ft.toFixed(1)} ft · trigger {g.trigger_ft.toFixed(1)} ft
              </Tooltip>
            </CircleMarker>
          ))}
        </MapContainer>
      </section>

      <aside className="side">
        {isAdmin && (
          <div className="card">
            <h3>Harvey replay</h3>
            <p className="muted">Plays the 2017 flood peak through the full pipeline in about 90 seconds.</p>
            <div className="row">
              <button className="primary" onClick={act(api.replayStart)} disabled={replay?.status === "running"}>
                Start replay
              </button>
              <button onClick={act(api.replayReset)}>Reset</button>
            </div>
            {replay?.run_id && <p className="muted small">run {replay.run_id} · {replay.status}</p>}
            {adminError && <p className="error small">{adminError}</p>}
          </div>
        )}

        <div className="card">
          <h3>Demo gauges</h3>
          {error && <p className="error">{error}</p>}
          <ul className="gauge-list">
            {gauges
              ?.filter((g) => g.demo_ready)
              .map((g) => (
                <li key={g.gauge_id} onClick={() => navigate(`/gauge/${encodeURIComponent(g.gauge_id)}`)}>
                  <span className="dot" style={{ background: COLORS[g.status] }} />
                  <span className="grow">{g.name}</span>
                  <span className="num">{g.latest_ft.toFixed(1)} ft</span>
                </li>
              ))}
          </ul>
        </div>

        <div className="card">
          <h3>Storm</h3>
          {!storms?.length && <p className="muted">No gauge has crossed its trigger in this run.</p>}
          {storms?.map((s) => (
            <div key={s.storm_id}>
              <p className="small muted">
                {s.storm_id} · {s.status.replace("_", " ")} · interim share {s.f_int ?? "–"} · final {s.f_fin ?? "–"} ·{" "}
                {s.payouts.length} payout(s)
              </p>
              <ul className="events">
                {s.events.map((e) => (
                  <li key={e.event_id}>
                    <b>{nameOf(e.gauge_id)}</b> crossed at {e.value.toFixed(2)} ft
                    {e.closed_at ? " · closed" : " · open"}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}
