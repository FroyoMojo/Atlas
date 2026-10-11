// Your account, by role: a sponsor's donations, an investor's bond holding. A household's account is
// My protection, so that role is sent there.
import { Link, Navigate } from "react-router-dom";
import { api } from "../api";
import { explorer } from "../config";
import { Contours, usd } from "../components/ui";
import { ROLES, useRole } from "../role";
import { usePoll } from "../usePoll";

const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export function AccountPage() {
  const { role, account, openPanel } = useRole();
  const owner = account;

  if (role === "household") return <Navigate to="/me" replace />;

  const head = (title: string, text: string) => (
    <div className="hero pad-mid">
      <Contours />
      <section className="hero-body center">
        <span className="eyebrow">{role ? ROLES[role].label : "Account"}</span>
        <h1 className="h1-page">{title}</h1>
        <p>{text}</p>
      </section>
    </div>
  );

  if (!owner) {
    return (
      <>
        {head("Your account", "Log in to see what you hold.")}
        <div className="page"><button className="btn btn-primary" onClick={() => openPanel("signin")}>Log in</button></div>
      </>
    );
  }
  if (!role) {
    return (
      <>
        {head("Your account", "Tell us how you're using Atlas and we'll show the right account page.")}
        <div className="page"><button className="btn btn-primary" onClick={() => openPanel("account")}>Choose your role</button></div>
      </>
    );
  }
  return role === "sponsor" ? <Sponsor owner={owner} head={head} /> : <Investor owner={owner} head={head} />;
}

type Head = (title: string, text: string) => JSX.Element;

function Sponsor({ owner, head }: { owner: string; head: Head }) {
  const { data, error } = usePoll(() => api.sponsorAccount(owner), 4000, [owner]);
  return (
    <>
      {head("My donations", "What you have given to the community fund. It earns no return and lowers the price for every household.")}
      <div className="page">
        <section className="lift money-card" aria-live="polite">
          <div>
            <span>Total donated</span>
            <span className="big-num">{data ? usd(data.donated_total, true) : "–"}</span>
          </div>
          <div>
            <span>Donations</span>
            <span className="big-num">{data ? data.donations.length : "–"}</span>
          </div>
        </section>
        {error && <p className="error small">{error}</p>}
        <section className="stack">
          <h2 className="section-title" style={{ fontSize: 22 }}>History</h2>
          <div className="payouts">
            {data && !data.donations.length && <div className="payout"><span className="muted">No donations from this wallet yet.</span></div>}
            {data?.donations.map((d) => (
              <div className="payout" key={d.tx_sig ?? d.at}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <b>{usd(d.amount, true)}</b>
                  <span className="small muted">{when(d.at)}{d.tx_sig && <> · <a href={explorer(d.tx_sig)} target="_blank" rel="noreferrer">View</a></>}</span>
                </div>
              </div>
            ))}
          </div>
          <Link to="/readiness" className="link-row">Fund readiness →</Link>
        </section>
      </div>
    </>
  );
}

function Investor({ owner, head }: { owner: string; head: Head }) {
  const { data, error } = usePoll(() => api.investorAccount(owner), 4000, [owner]);
  const { data: harvey } = usePoll(() => api.stress("harvey"), 60_000, []);
  return (
    <>
      {head("My bond", "Your holding in the Atlas catastrophe bond, at today's value per unit.")}
      <div className="page">
        <section className="lift money-card" aria-live="polite">
          <div>
            <span>Bond units</span>
            <span className="big-num">{data ? data.units.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "–"}</span>
          </div>
          <div>
            <span>Value now</span>
            <span className="big-num">{data?.value_usd != null ? usd(data.value_usd, true) : "–"}</span>
          </div>
        </section>
        {error && <p className="error small">{error}</p>}
        <section className="stack">
          <p className="small muted" style={{ margin: 0 }}>
            Value per unit {data?.nav_per_unit != null ? data.nav_per_unit.toFixed(4) : "–"}.
            {harvey && <> In a Harvey-sized storm with Houston as the only market, holders would lose about {Math.round(harvey.investor_loss_pct)}% of this.</>}{" "}
            Devnet test dollars; the coupon is not paid out in the demo.
          </p>
          <Link to="/invest" className="link-row">Invest more →</Link>
        </section>
      </div>
    </>
  );
}
