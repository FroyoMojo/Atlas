import { CircleMarker, MapContainer, TileLayer, Tooltip } from "react-leaflet";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { config } from "../config";
import type { GaugeStatus } from "../types";
import { usePoll } from "../usePoll";

const COLORS: Record<GaugeStatus, string> = { normal: "#2e9e5b", near: "#d99a0b", triggered: "#d23b2f" };

export function MapPage() {
  const navigate = useNavigate();
  const { data: gauges, error } = usePoll(api.gauges, 1000);
  const { data: events } = usePoll(() => api.events(null), 1500);
  const { data: replay } = usePoll(api.replayStatus, 1000);

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
              pathOptions={{ color: COLORS[g.status], fillColor: COLORS[g.status], fillOpacity: 0.65, weight: 2 }}
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
        {config.demoMode && (
          <div className="card">
            <h3>Harvey replay</h3>
            <p className="muted">Plays the 2017 flood peak through the full pipeline in about 90 seconds.</p>
            <div className="row">
              <button className="primary" onClick={() => api.replayStart()} disabled={replay?.running}>
                Start replay
              </button>
              <button onClick={() => api.replayReset()}>Reset</button>
            </div>
            {replay?.run_id && <p className="muted small">run {replay.run_id}</p>}
          </div>
        )}

        <div className="card">
          <h3>Gauges</h3>
          {error && <p className="error">{error}</p>}
          <ul className="gauge-list">
            {gauges?.map((g) => (
              <li key={g.gauge_id} onClick={() => navigate(`/gauge/${encodeURIComponent(g.gauge_id)}`)}>
                <span className="dot" style={{ background: COLORS[g.status] }} />
                <span className="grow">{g.name}</span>
                <span className="num">{g.latest_ft.toFixed(1)} ft</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="card">
          <h3>Triggers</h3>
          {!events?.length && <p className="muted">No gauge has crossed its trigger in this run.</p>}
          <ul className="events">
            {events?.map((e) => (
              <li key={`${e.run_id}-${e.wave_id}-${e.gauge_id}`}>
                <b>{gauges?.find((g) => g.gauge_id === e.gauge_id)?.name ?? e.gauge_id}</b> crossed at{" "}
                {e.reading_ft.toFixed(1)} ft · {e.payouts.length} payout(s)
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
