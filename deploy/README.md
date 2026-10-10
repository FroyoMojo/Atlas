# Deploy to Vultr (Jesse)

One Ubuntu 24.04 instance runs everything behind Caddy (plan v3.1 section 9). About 30 minutes.
The Caddy routing was tested locally: chain routes, `/engine/*` with the prefix stripped, the
dashboard, and `/chain/reset` blocked from outside (403).

## 0. Devnet SOL (do this first, it can take a while)

The public faucet refuses scripts. On your laptop:

```bash
cd chain && npm install && npm run keygen      # prints the treasury address
```

Open https://faucet.solana.com, sign in with GitHub, choose **devnet**, paste the treasury
address, request the maximum (repeat if allowed). Or ask Zeke to send 5 devnet SOL.
Then, still on your laptop, follow the setup in `chain/README.md` from `setup:ausd` down to
`setup:bond` and `test:token2022`. Commit `chain/state/devnet.json`.

## 1. Create the server

Vultr: Cloud Compute, Ubuntu 24.04, 2 GB RAM is enough. Note the IP. Claim the hackathon credits first.

## 2. Domain

GoDaddy Registry: register the domain, add an `A` record for `@` (and `www` if you want) pointing
at the IP. DNS can lag; the setup also serves `<ip-with-dashes>.sslip.io` with HTTPS right away.

## 3. One-time setup (on the server, as root)

```bash
curl -fsSL https://raw.githubusercontent.com/FroyoMojo/Rug-Radar/claude/gallant-volta-hnfqcu/deploy/setup-server.sh -o setup.sh
bash setup.sh claude/gallant-volta-hnfqcu your-domain.com      # or leave the domain empty
```

## 4. Secrets and config (from your laptop)

```bash
scp secrets/issuer.json secrets/treasury.json secrets/bot.json root@IP:/opt/atlas/secrets/
scp chain/state/devnet.json root@IP:/opt/atlas/chain/state/
ssh root@IP 'chown -R atlas:atlas /opt/atlas/secrets /opt/atlas/chain/state && chmod 600 /opt/atlas/secrets/*'
ssh root@IP 'nano /opt/atlas/.env'
```

In `/opt/atlas/.env` set at least: `DATABASE_URL` (Tiger), `SOLANA_RPC_URL` (a devnet provider
URL), `ADMIN_TOKEN` (same value Zeke uses), `DEMO_WALLETS` (your demo wallets and phone, comma
separated), `PUBLIC_BASE_URL=https://your-domain.com`, `PURCHASE_FLOW=a`, `DEMO_MODE=true`.
Only the server needs `issuer`, `treasury` and `bot`; member and holder keys stay on your laptop.

## 5. Deploy (and every update after)

```bash
ssh root@IP 'bash /opt/atlas/deploy/deploy.sh'
```

It pulls, installs, builds the web app pointed at this host, renders the Caddyfile, and restarts
`atlas-chain` and `atlas-bot`. It prints the live URL.

## 6. Database tables and policies (once the Tiger schema exists)

```bash
ssh root@IP 'cd /opt/atlas/chain && sudo -u atlas npm run migrate'
ssh root@IP 'cd /opt/atlas/chain && sudo -u atlas npm run precreate -- GAUGE1,GAUGE2,GAUGE3,GAUGE4 10'
```

Use Zeke's four `demo_ready` gauge IDs.

## 7. Engine

Zeke's FastAPI listens on `127.0.0.1:8000`; Caddy serves it at `https://host/engine/...`.
Template unit: `deploy/systemd/atlas-engine.service`.

## Checks

```bash
curl https://your-domain.com/health                 # chain service
curl https://your-domain.com/chain/balances         # vault, float, bond units
curl -X POST https://your-domain.com/chain/reset    # must be 403 from outside
journalctl -u atlas-bot -f                          # payout bot log
```
