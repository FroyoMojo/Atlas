// My protection: "You're protected" before a flood, "We've sent you $500" after one.
// /me uses the connected wallet; /phone?owner=<address> mirrors one wallet full-screen for the
// projector (no nav). The balance is read straight from chain.
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { areaOf } from "../areas";
import { config, explorer, short } from "../config";
import { Brand, Contours, Level, Pill, usd } from "../components/ui";
import { WalletHelp } from "../components/WalletHelp";
import { useRole } from "../role";
import type { Policy } from "../types";
import { usePoll } from "../usePoll";
import { useConnectWallet } from "../wallet";
import { fmtTime, useReplay } from "../useReplay";

const DAY = 86_400_000;

export function MyPage({ standalone = false }: { standalone?: boolean }) {
  const [params] = useSearchParams();
  const { publicKey } = useWallet();
  const connectWallet = useConnectWallet();
  const { connection } = useConnection();
  const { account } = useRole();
  const owner = params.get("owner") ?? publicKey?.toBase58() ?? account;
  const { runId, historic } = useReplay();

  const { data: policies, error } = usePoll(() => (owner ? api.policies(owner) : Promise.resolve([] as Policy[])), 1500, [owner]);
  const { data: gauges } = usePoll(() => api.gauges(runId), 2000, [runId]);
  const { data: ready } = usePoll(() => api.readiness().catch(() => null), 5000);
  const { data: balance } = usePoll(
    async () => {
      if (!owner || !config.ausdMint) return null;
      const ata = getAssociatedTokenAddressSync(new PublicKey(config.ausdMint), new PublicKey(owner));
      try {
        return (await connection.getTokenAccountBalance(ata, "confirmed")).value.uiAmount ?? 0;
      } catch (e) {
        // No token account yet means 0. Any other error (e.g. a 429) keeps the last balance shown.
        if (/could not find account/i.test(String((e as Error).message ?? e))) return 0;
        throw e;
      }
    },
    1500,
    [owner],
  );

  // A payout that confirms while the page is open gets the "+$500 just now" flash.
  const seen = useRef<{ owner: string; sigs: Set<string> } | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  useEffect(() => {
    if (!policies || !owner) return;
    const sigs = policies.filter((p) => p.last_payout).map((p) => p.last_payout!.tx_sig);
    if (seen.current?.owner !== owner) {
      seen.current = { owner, sigs: new Set(sigs) };
      return;
    }
    for (const s of sigs) if (!seen.current.sigs.has(s)) (seen.current.sigs.add(s), setFresh(s));
  }, [policies, owner]);

  const byNewest = [...(policies ?? [])].sort((a, b) => Date.parse(b.starts_at) - Date.parse(a.starts_at));
  const paid = byNewest
    // A demo policy reset to ACTV can still carry an old payout record: only count real payments.
    .filter((p) => p.last_payout && (p.status === "PAID" || p.paid_amount > 0))
    .sort((a, b) => Date.parse(b.last_payout!.at) - Date.parse(a.last_payout!.at))[0];
  const active = byNewest.find((p) => p.status === "ACTV");
  const main = paid ?? active ?? null;
  const gauge = gauges?.find((g) => g.gauge_id === main?.gauge_id) ?? null;
  const { area, river } = areaOf(gauge, main?.gauge_id);
  const others = byNewest.filter((p) => p !== main);

  const top = (
    <div className="phone-top">
      {standalone ? <Brand size={26} /> : <span />}
      {owner && <span className="phone-wallet">{short(owner)}</span>}
    </div>
  );
  const balanceText = balance == null ? "–" : usd(balance, true);

  if (!owner) {
    return (
      <Shell standalone={standalone}>
        <div className="hero phone-hero tight">
          <Contours />
          <div className="col">
            {top}
            <h1>My protection</h1>
            <div className="lead"><p>Connect the wallet you used to get protected.</p></div>
          </div>
        </div>
        <div className="col"><div className="phone-body">
          <button className="btn btn-primary btn-block" onClick={connectWallet}>Connect wallet</button>
          <Link to="/protect" className="link-row" style={{ textAlign: "center" }}>Not protected yet? Get protected →</Link>
        </div></div>
      </Shell>
    );
  }

  if (paid) {
    const lp = paid.last_payout!;
    const partial = paid.paid_amount < paid.payout;
    return (
      <Shell standalone={standalone}>
        <div className="hero phone-hero">
          <Contours />
          <div className="col">
            {top}
            <section className="lead" aria-live="polite">
              <span className="pill pill-triggered" style={{ alignSelf: "flex-start", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                <i className="dot" style={{ width: 6, height: 6, background: "#fff" }} />
                Flood detected · {area} · {fmtTime(historic(lp.at))}
              </span>
              <p className="headline">
                {partial ? `We've sent you ${usd(paid.paid_amount)} now.` : `We've sent you ${usd(paid.paid_amount)} for immediate costs.`}
              </p>
              <p>
                {partial
                  ? `The rest of your ${usd(paid.payout)} follows when the storm ends. You don't need to file anything.`
                  : "It's in your wallet now. You don't need to file anything."}
              </p>
            </section>
          </div>
        </div>
        <div className="col">
          <div className={`lift phone-card ${fresh ? "flash" : ""}`} key={fresh ?? "card"} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span className="small muted">Wallet balance</span>
              <span className="big-num" style={{ fontSize: 30 }}>{balanceText}</span>
            </div>
            {fresh && <span className="pill" style={{ background: "#E6F0F8", color: "#0A3A5F", fontSize: 13 }}>+{usd(lp.amount)} just now</span>}
          </div>
          <div className="phone-body">
            <h2 className="section-title">Right now</h2>
            <div className="step urgent"><b>1</b><span>In danger? Call <strong>911</strong>. Don't drive through water.</span></div>
            <div className="step"><b>2</b><span><a href="https://www.readyharris.org" target="_blank" rel="noreferrer" style={{ fontWeight: 700 }}>Find an open shelter</a> near you.</span></div>
            <div className="step"><b>3</b><span>Use your {usd(paid.paid_amount)} for a room, food or a missed shift.</span></div>
            <Link to={`/proof?sig=${encodeURIComponent(lp.tx_sig)}`} className="link-row">Why you were paid: the flood reading, on the record →</Link>
            <Others list={others} />
          </div>
        </div>
      </Shell>
    );
  }

  if (active) {
    const daysLeft = Math.max(0, Math.ceil((Date.parse(active.ends_at) - Date.now()) / DAY));
    const until = new Date(active.ends_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    const startsLater = Date.parse(active.starts_at) > Date.now();
    const starts = new Date(active.starts_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return (
      <Shell standalone={standalone}>
        <div className="hero phone-hero">
          <Contours />
          <div className="col">
            {top}
            <section className="lead">
              <span className="pill pill-sky" style={{ alignSelf: "flex-start", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden="true"><path d="M7 1.5l4.5 1.8v3.4c0 2.8-1.9 4.6-4.5 5.6-2.6-1-4.5-2.8-4.5-5.6V3.3z" fill="#0A3A5F" /></svg>
                You're protected
              </span>
              <p className="headline">If {area} floods, {usd(active.payout)} lands here automatically.</p>
              <p>
                {startsLater ? `Protection starts ${starts} (after the waiting period) and runs until ${until}.` : `Covered until ${until}.`} You
                don't need to do anything.
              </p>
            </section>
          </div>
        </div>
        <div className="col">
          <div className="lift phone-card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <b style={{ fontSize: 15 }}>Flood risk now</b>
              {gauge && <Pill status={gauge.status} />}
            </div>
            {gauge ? (
              <>
                <Level gauge={gauge} height={8} />
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#667085" }}>
                  <span>{river} <strong style={{ color: "#101828" }}>{gauge.latest_ft == null ? "–" : `${gauge.latest_ft.toFixed(1)} ft`}</strong></span>
                  <span>Pays at <strong style={{ color: "#B42318" }}>{gauge.trigger_ft} ft</strong></span>
                </div>
              </>
            ) : (
              <span className="small muted">Loading the river level…</span>
            )}
          </div>
          <div className="phone-body">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span className="small muted" style={{ fontSize: 14 }}>Wallet balance</span>
              <span className="big-num" style={{ fontSize: 28 }}>{balanceText}</span>
            </div>
            <div className="tiles">
              <div className="tile"><span>Pays out</span><b>{usd(active.payout)}</b></div>
              <div className="tile"><span>Days left</span><b>{daysLeft}</b></div>
            </div>
            {ready && ready.pool.readiness < 0.999 && (
              <div className="notice info" style={{ fontSize: 14 }}>
                The pool is {Math.round(ready.pool.readiness * 100)}% ready: if a flood hit today, expect{" "}
                <b>{usd(active.payout * ready.pool.readiness)} of {usd(active.payout)}</b>. <Link to="/readiness">How to close the gap →</Link>
              </div>
            )}
            <div className="list">
              <Link to="/how#if-it-floods">What to do if it floods <span>→</span></Link>
              <a href={explorer(active.policy_mint, "address")} target="_blank" rel="noreferrer">Your policy on Solana <span>→</span></a>
            </div>
            <Others list={others} />
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell standalone={standalone}>
      <div className="hero phone-hero tight">
        <Contours />
        <div className="col">
          {top}
          <h1>{policies ? "You're not protected yet" : "My protection"}</h1>
        </div>
      </div>
      <div className="col"><div className="phone-body">
        {error && <div className="notice bad">{error}</div>}
        {!policies && !error && <p className="muted">Loading your protection…</p>}
        {policies && (
          <>
            <p className="muted" style={{ margin: 0 }}>Wallet balance <b style={{ color: "#101828" }}>{balanceText}</b></p>
            <Link to="/protect" className="btn btn-primary btn-block">Get protected</Link>
            <Others list={others} />
          </>
        )}
      </div></div>
    </Shell>
  );
}

function Shell({ standalone, children }: { standalone: boolean; children: React.ReactNode }) {
  return standalone ? <div className="app" style={{ background: "#F6F8FA" }}>{children}<WalletHelp /></div> : <>{children}</>;
}

function Others({ list }: { list: Policy[] }) {
  if (!list.length) return null;
  const label = (p: Policy) => (p.status === "ACTV" ? "Active" : p.status === "PAID" ? "Paid" : "Ended");
  return (
    <div className="list">
      {list.map((p) => (
        <a key={p.policy_mint} href={explorer(p.policy_mint, "address")} target="_blank" rel="noreferrer">
          <span>{areaOf({ gauge_id: p.gauge_id, name: p.gauge_name ?? p.gauge_id }).area} · {usd(p.payout)}</span>
          <span className="muted" style={{ fontWeight: 500 }}>{label(p)}</span>
        </a>
      ))}
    </div>
  );
}
