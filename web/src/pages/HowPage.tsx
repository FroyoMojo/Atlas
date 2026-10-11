import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Contours } from "../components/ui";

export function HowPage() {
  const { hash } = useLocation();
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
  }, [hash]);

  return (
    <>
      <div className="hero pad-mid">
        <Contours />
        <section className="hero-body center">
          <span className="eyebrow">How it works</span>
          <h1 style={{ fontSize: 46 }}>No claim. The river decides.</h1>
          <p>Atlas pays a fixed amount when the river gauge next to your neighborhood reaches flood level.</p>
        </section>
      </div>

      <div className="page">
        <div className="steps3">
          <div className="lift">
            <span className="num">1</span>
            <h3>Get protected</h3>
            <p>Enter where you live and pick $250 or $500. You pay once for 90 days of protection.</p>
          </div>
          <div className="lift">
            <span className="num">2</span>
            <h3>We watch the river</h3>
            <p>The USGS gauge for your area reports every 15 minutes. A flood counts when it stays at the official moderate flood level for two readings in a row.</p>
          </div>
          <div className="lift">
            <span className="num">3</span>
            <h3>Money arrives</h3>
            <p>The payment goes to your wallet within minutes, with a fingerprint of the reading it paid on. Nobody approves it by hand.</p>
          </div>
        </div>

        <section className="faq">
          <div id="if-it-floods">
            <h3>If it floods</h3>
            <p>Your safety comes first: if you're in danger, call 911 and don't drive through water. The money is for the first days: a room, food, a missed shift. You don't need to file anything.</p>
          </div>
          <div>
            <h3>What it isn't</h3>
            <p>It's a fixed emergency payment, not property insurance. It doesn't depend on damage to your home, and it doesn't replace flood insurance. Residents only, one per household.</p>
          </div>
          <div>
            <h3>Where the money comes from</h3>
            <p>Premiums go into a reserve held by a 2-of-3 multisig. Behind it sits community money (seed reserve, saved surplus, sponsor donations), and behind that a catastrophe bond: investors earn T-bill interest plus a spread and lose principal only in the remote tail. If a storm were ever bigger than all of it, everyone gets the same share right away and the rest when the storm ends. <Link to="/proof">See the numbers →</Link></p>
          </div>
          <div>
            <h3>Three ways to take part</h3>
            <p><b>Households</b> buy protection and get a fixed payment when the river floods. <b>Sponsors</b> donate to a market on the <Link to="/readiness">Markets</Link> page: it raises how much of every payout is funded and lowers the price, and it earns no return. <b>Investors</b> buy the <Link to="/invest">catastrophe bond</Link>: it takes only the remote tail of flood losses, after premiums and community money, and pays T-bill interest plus a spread for that risk.</p>
          </div>
          <div>
            <h3>This demo</h3>
            <p>It runs on Solana devnet with test dollars, and replays Hurricane Harvey's real 2017 river readings in about 90 seconds.</p>
          </div>
        </section>
      </div>
    </>
  );
}
