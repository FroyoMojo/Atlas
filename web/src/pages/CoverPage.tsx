import { useWallet } from "@solana/wallet-adapter-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { areaOf, AREAS, lookup } from "../areas";
import { CheckIcon, Contours, price } from "../components/ui";
import { friendlyError } from "../errors";
import { useRole } from "../role";
import { usePoll } from "../usePoll";
import { useReplay } from "../useReplay";
import { useConnectWallet, useServerTx } from "../wallet";

export function CoverPage() {
  const navigate = useNavigate();
  const { role, setRole } = useRole();
  const preset = decodeURIComponent(useParams().id ?? "");
  const { runId } = useReplay();
  const { data: gauges } = usePoll(() => api.gauges(runId), 3000, [runId]);

  // Coming from the map, the address box starts filled in with that area.
  const [address, setAddress] = useState("");
  useEffect(() => {
    if (preset) setAddress(`${AREAS.find((a) => a.gauge_id === preset)?.area ?? ""}, Houston`.replace(/^, /, ""));
  }, [preset]);

  const gauge = gauges ? lookup(address, gauges) : null;
  const typed = address.trim().length >= 3;
  const notCovered = typed && !!gauges && !gauge;
  const [payout, setPayout] = useState(500);
  const { data: quote, error: quoteError } = usePoll(
    () => (gauge ? api.quote(gauge.gauge_id, payout, runId) : Promise.resolve(null)),
    5000,
    [gauge?.gauge_id, payout, runId],
  );
  const { area, river } = areaOf(gauge);

  const { publicKey } = useWallet();
  const connectWallet = useConnectWallet();
  const { purchase } = useServerTx();
  const [buying, setBuying] = useState(false);
  const [buyError, setBuyError] = useState<string | null>(null);
  const [why, setWhy] = useState(false);

  async function buy() {
    if (!gauge) return;
    if (!publicKey) return connectWallet();
    setBuying(true);
    setBuyError(null);
    try {
      const { transaction, flow } = await api.buyTx(gauge.gauge_id, payout, publicKey.toBase58());
      await purchase(transaction, flow);
      if (!role) setRole("household");
      navigate("/me");
    } catch (e) {
      setBuyError(friendlyError(e));
    } finally {
      setBuying(false);
    }
  }

  const open = !!quote && quote.sales_open && !quoteError;
  const termDays = quote?.term_days ?? 90;

  return (
    <>
      <div className="hero phone-hero tight">
        <Contours />
        <div className="col">
          <h1>Get ${payout} if your neighborhood floods.</h1>
        </div>
      </div>

      <div className="col">
        <div className="phone-body" style={{ gap: 24, paddingTop: 24 }}>
          <div className="field">
            <label htmlFor="addr">Where do you live?</label>
            <input
              id="addr"
              className={`input ${gauge ? "ok" : notCovered ? "bad" : ""}`}
              placeholder="ZIP code or neighborhood, e.g. 77096"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              autoComplete="postal-code"
            />
            {gauge && (
              <>
                <span className="status-line ok"><CheckIcon /> You're in a covered area</span>
                <span className="hint">
                  We pay when {river} reaches {gauge.trigger_ft} ft, the official moderate flood level for {area}.
                </span>
              </>
            )}
            {notCovered && (
              <>
                <span className="status-line bad"><CheckIcon ok={false} /> Not covered yet</span>
                <span className="hint">
                  Atlas only covers areas next to a river gauge it watches. Right now that's{" "}
                  {[...new Set(AREAS.filter((a) => gauges?.some((g) => g.gauge_id === a.gauge_id && g.demo_ready)).map((a) => a.area))].join(", ")}.
                </span>
              </>
            )}
          </div>

          {gauge && (
            <div className="field">
              <span className="label">Amount</span>
              <div className="segmented" role="group" aria-label="Amount">
                {[250, 500].map((n) => (
                  <button key={n} aria-pressed={payout === n} onClick={() => setPayout(n)}>${n}</button>
                ))}
              </div>
            </div>
          )}

          {gauge && quote && !quote.sales_open && (
            <div className="notice bad">
              New protection for {area} is paused while a flood is expected. {quote.reason ? `(${quote.reason})` : ""} It reopens once the river is back to normal.
            </div>
          )}
          {quoteError && <div className="notice bad">Couldn't get a price: {quoteError}</div>}

          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 8 }}>
            <div className="price-row">
              <span style={gauge ? undefined : { color: "#98A2B3" }}>{termDays} days</span>
              <b style={gauge ? undefined : { color: "#98A2B3" }}>{gauge && quote ? price(quote.premium) : "–"}</b>
            </div>
            {gauge && quote?.readiness != null && (
              <div className="notice info" style={{ fontSize: 14 }}>
                The pool is <b>{Math.round(quote.readiness * 100)}% ready</b>: if a flood hit today you'd get{" "}
                <b>{price(payout * quote.readiness)}</b> of ${payout}.
                {quote.premium_if_ready != null && quote.premium_if_ready < quote.premium - 0.005 && (
                  <> The price falls to <b>{price(quote.premium_if_ready)}</b> as the neighborhood gets fully ready.</>
                )}{" "}
                <Link to="/readiness">See readiness →</Link>
              </div>
            )}
            {gauge || !notCovered ? (
              <button className="btn btn-primary btn-block" onClick={buy} disabled={!gauge || !open || buying}>
                {buying ? "Confirm in your wallet…" : !publicKey && gauge ? "Connect wallet to continue" : "Get protected"}
              </button>
            ) : (
              <>
                <button className="btn btn-block" disabled>Get protected</button>
                <Link to="/" className="link-row" style={{ textAlign: "center", fontSize: 15 }}>See covered areas on the map</Link>
              </>
            )}
            {buyError && <div className="notice bad">{buyError}</div>}
            <p className="fineprint">
              Residents only, one per household. Not property insurance.{" "}
              {gauge && quote && (
                <button className="why-link" onClick={() => setWhy(!why)} aria-expanded={why}>Why {price(quote.premium)}?</button>
              )}
            </p>
            {why && gauge && quote && (
              <div className="why">
                {quote.exceedances != null && quote.years != null
                  ? `${river} has reached flood level ${quote.exceedances} time${quote.exceedances === 1 ? "" : "s"} in ${Math.round(quote.years)} years of USGS records`
                  : `Priced from how often ${river} has reached flood level in USGS records`}
                : about a {(quote.p_payout * 100).toFixed(1)}% chance of a payout in {termDays} days. The rest of the price
                covers keeping enough money set aside to pay everyone in a storm like Harvey.
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
