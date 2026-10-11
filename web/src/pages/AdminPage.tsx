// #/admin: store the admin token on the demo laptop so Start and Reset appear (plan v3 9.3).
import { useState } from "react";
import { Link } from "react-router-dom";
import { getAdminToken, setAdminToken } from "../admin";

export function AdminPage() {
  const [value, setValue] = useState("");
  const [saved, setSaved] = useState(!!getAdminToken());
  return (
    <div className="page" style={{ maxWidth: 560, paddingTop: 32 }}>
      <section className="card stack">
        <h2 className="section-title">Demo controls</h2>
        <p className="muted small" style={{ margin: 0 }}>
          The admin token is stored only in this browser. With it set, Start replay and Reset appear on the map.
        </p>
        <div className="payout-row">
          <input className="input" style={{ flex: "1 1 240px" }} type="password" placeholder="ADMIN_TOKEN" value={value} onChange={(e) => setValue(e.target.value)} />
          <button className="btn btn-primary" onClick={() => (setAdminToken(value.trim() || null), setSaved(!!value.trim()), setValue(""))}>Save</button>
          <button className="btn btn-outline" onClick={() => (setAdminToken(null), setSaved(false))}>Clear</button>
        </div>
        <p className="small" style={{ margin: 0 }}>
          {saved ? <>Token saved. <Link to="/">Go to the map →</Link></> : "No token stored."}
        </p>
      </section>
    </div>
  );
}
