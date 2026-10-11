# Hosting on the demo laptop (Jesse)

No server: everything runs on one laptop, and Cloudflare Tunnel gives it a public HTTPS URL
(Devpost needs a hosted site). The GoDaddy Registry domain points at the same tunnel once its DNS
is on Cloudflare. The site is up while the laptop is on, which is what in-person judging needs.

```
phone / judges ──HTTPS──> Cloudflare ──tunnel──> laptop :8080 gateway
                                                  ├─ /engine/*   -> FastAPI :8000 (Ezekiel)
                                                  ├─ chain routes -> chain service :8787
                                                  ├─ /chain/reset -> 403 (localhost only)
                                                  └─ dashboard (web/dist)
                                                 payout bot runs alongside
                                                 (npm run stack starts all four)
```

Tested here: the gateway routes, the dashboard, `/chain/reset` blocked through the gateway, and
`cloudflared` issuing a tunnel URL. (This build machine's network can't hold the tunnel open;
a normal laptop can.)

## 1. Install (once, ~5 min)

- Node 22 and git.
- cloudflared: macOS `brew install cloudflared`; Windows `winget install --id Cloudflare.cloudflared`;
  Linux: the `.deb` from https://github.com/cloudflare/cloudflared/releases.
- Python 3.11+ for the engine (it runs on this laptop with everything else). On Windows, if
  `python3` is not a command, change `python3` to `py` in the `engine` script of `chain/package.json`.

## 2. Code, keys, config

```bash
git clone https://github.com/FroyoMojo/Atlas.git && cd Atlas
(cd chain && npm install) && (cd web && npm install)
pip install -r engine/requirements.txt
mkdir -p secrets       # copy in the whole secrets/ folder: all 10 keypairs (sent separately; never commit)
cp .env.example .env   # then edit
```

In `.env` set at least: `DATABASE_URL` (Tiger), `ADMIN_TOKEN` (one shared value),
`DEMO_WALLETS` (demo wallets and your phone, comma separated), `PURCHASE_FLOW=a`,
`PUBLIC_BASE_URL` (the public URL from step 4 or 5), and `SOLANA_RPC_URL` (your Helius devnet URL;
the public devnet RPC returns 429s under load). The dashboard never uses `SOLANA_RPC_URL`, because
it carries your API key: the browser uses the public devnet RPC, or `WEB_RPC_URL` if you set a
separate key locked to your domain.

Don't keep `VITE_ENGINE_URL` or `VITE_CHAIN_URL` in `web/.env.local` on this laptop if you can
avoid it; `npm run web:build` overrides them anyway.

## 3. Build and start

```bash
psql "$(grep ^DATABASE_URL= .env | cut -d= -f2-)" -f engine/sql/schema.sql   # engine tables (once; safe to re-run)
# Gauges and history (once; Ezekiel's final gauge IDs and triggers, see data/README.md):
#   python3 data/usgs.py gauges ...  &&  python3 data/usgs.py peaks  &&  python3 data/usgs.py iv --start 2017-08-23 --end 2017-09-04
cd chain
npm run migrate                              # chain tables in Tiger (once)
npm run precreate -- G1,G2,G3,G4 10          # the four demo gauge IDs (once)
npm run web:build                            # dashboard for hosting (same-origin API calls)
npm run stack                                # engine + chain service + payout bot + gateway, auto-restart
```

`npm run stack` runs the engine (FastAPI) on `127.0.0.1:8000` with the rest. Then press **Reset**
once on the dashboard (admin page) to fill the vault and float before the first run.

In a second terminal: `cd chain && npm run preflight`. It checks configuration, keys, devnet,
the database, every demo gauge (free policy mints, history, Harvey readings), the services, the
admin token, reconciliation, the hosted build and the public URL, and changes nothing. Fix every
FAIL; WARNs are advice.

## 4. Public URL now (no account)

```bash
cloudflared tunnel --url http://localhost:8080
```

It prints `https://<random>.trycloudflare.com`. That is the hosted URL until the domain is ready.
It changes each time you restart this command, so leave it running.

## 5. The GoDaddy Registry domain (keeps the GoDaddy track)

1. Free Cloudflare account -> **Add a site** -> your domain -> Free plan. Cloudflare shows two nameservers.
2. At the registrar where you bought the domain, replace the nameservers with Cloudflare's. Usually minutes, sometimes up to an hour.
3. On the laptop, once Cloudflare says the site is active:

```bash
cloudflared tunnel login                       # pick the domain in the browser
cloudflared tunnel create atlas
cloudflared tunnel route dns atlas your-domain.com
cloudflared tunnel run --url http://localhost:8080 atlas
```

4. Set `PUBLIC_BASE_URL=https://your-domain.com` in `.env`, restart `npm run stack`.

Fallback if the nameservers are slow: at the registrar, forward the domain to the trycloudflare URL.

## Before judging

- Laptop plugged in; sleep off (macOS `caffeinate -dims`; Windows: Power settings -> never sleep).
- `npm run stack` and the tunnel running in two terminals; hotspot ready if the venue Wi-Fi drops.
- `npm run preflight` shows READY (no FAIL).
- Reset, buy one backup policy, Start, and watch one full run end to end 20 minutes before judging.
- Check: `https://your-domain.com/health`, the phone view, and `curl -X POST https://your-domain.com/chain/reset` returns 403.
