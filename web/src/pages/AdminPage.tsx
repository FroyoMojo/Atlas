// #/admin: store the admin token on the demo laptop so Start and Reset appear (plan v3 9.3).
import { useState } from "react";
import { getAdminToken, setAdminToken } from "../admin";

export function AdminPage() {
  const [value, setValue] = useState("");
  const [saved, setSaved] = useState(!!getAdminToken());
  return (
    <div className="card" style={{ maxWidth: 520 }}>
      <h3>Admin token</h3>
      <p className="muted small">Stored only in this browser. Start and Reset replay appear on the map when it is set.</p>
      <div className="row">
        <input className="grow" type="password" placeholder="ADMIN_TOKEN" value={value} onChange={(e) => setValue(e.target.value)} />
        <button className="primary" onClick={() => (setAdminToken(value.trim() || null), setSaved(!!value.trim()), setValue(""))}>
          Save
        </button>
        <button onClick={() => (setAdminToken(null), setSaved(false))}>Clear</button>
      </div>
      <p className="small">{saved ? "Token saved." : "No token stored."}</p>
    </div>
  );
}
