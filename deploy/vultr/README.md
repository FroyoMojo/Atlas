# Hosting on the Vultr server (Zeke's server, Jesse's domain)

**This is the current hosting setup** (Best Use of Vultr track). The laptop + Cloudflare Tunnel
setup in [`../README.md`](../README.md) is the fallback only.

**Status:** DNS done: `atlasflood.us` and `www` resolve to the server, `45.76.239.177`. The same stack runs: Caddy (HTTPS) -> gateway :8080 -> engine :8000
and chain service :8787, plus the payout bot. Only Caddy listens on the internet.

```
phone / judges --HTTPS--> Caddy :443 (Vultr) --> gateway 127.0.0.1:8080
                                                  |- /engine/*    -> FastAPI :8000
                                                  |- chain routes -> chain service :8787
                                                  |- /chain/reset -> 403
                                                  '- dashboard (web/dist)
                                                 bot + stack run under systemd (atlas-stack)
```

## 1. DNS (Jesse, at Porkbun: the domain's name servers are `*.ns.porkbun.com`)

In the Porkbun dashboard, **DNS records** for `atlasflood.us`:

1. Delete Porkbun's parking records for the root, `www` and `*` (usually an `ALIAS` and a `CNAME`
   to `pixie.porkbun.com`; sometimes `A` records). A leftover `ALIAS` blocks the root `A` record.
2. Add `A`, host empty (the root), answer = the Vultr server's IPv4, TTL 300.
3. Add `A`, host `www`, same IP (or a `CNAME` `www` -> `atlasflood.us`).

Check from any machine: `nslookup atlasflood.us` shows the Vultr IP. Propagation is usually minutes.
Until then the `sslip.io` hostname that setup prints (`1-2-3-4.sslip.io`) works with HTTPS straight away.

## 2. Vultr firewall

If the instance has a Vultr **Firewall Group**, allow inbound TCP 22, 80 and 443. (The server's own
`ufw` is set by the setup script.)

## 3. One-time server setup (Zeke)

Open the server's SSH (`ssh root@<server-ip>` from PowerShell, or Vultr's *View Console*):

```bash
curl -fsSL https://raw.githubusercontent.com/FroyoMojo/Atlas/main/deploy/vultr/setup-server.sh -o setup.sh
bash setup.sh atlasflood.us
```

It installs Node 22, Python, Caddy and the firewall, clones `main` into `/opt/atlas`, creates the
Python venv for the engine, and prints the server IP and the hostnames Caddy will serve.

## 4. Secrets and `.env` (never in git)

From the machine that has the keypairs (Jesse's; `secrets/` holds all 10):

```bash
scp -r secrets root@<server-ip>:/opt/atlas/
ssh root@<server-ip> "chown -R atlas:atlas /opt/atlas/secrets && chmod 700 /opt/atlas/secrets"
```

Edit `/opt/atlas/.env` on the server (`nano /opt/atlas/.env`). Start from Jesse's working `.env`
(it has the Helius `SOLANA_RPC_URL` and `DEMO_WALLETS`), and make sure these are right:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | the Tiger connection string (with the password) |
| `ADMIN_TOKEN` | the one shared value |
| `PUBLIC_BASE_URL` | `https://atlasflood.us` |
| `TERM_DAYS` | `90` |
| `DEMO_MODE` | `true` |
| `CHAIN_HOST` | `127.0.0.1` |

`chmod 600 /opt/atlas/.env`. `chain/state/devnet.json` (public addresses) is already in the repo.

## 5. Deploy

```bash
bash /opt/atlas/deploy/vultr/deploy.sh
```

Pulls, installs, builds the dashboard for this host, renders the Caddyfile, restarts the stack, and
prints local health checks. Run it again after every `git push` to `main`.

## 6. Check

```bash
curl https://atlasflood.us/health                                     # chain service ok
curl https://atlasflood.us/engine/health                              # engine ok
curl -X POST https://atlasflood.us/chain/reset -o /dev/null -w '%{http_code}\n'   # must print 403
```

Then, on the server, once (both are safe to re-run):

```bash
cd /opt/atlas/chain
sudo -u atlas npm run migrate        # adds anything Tiger is missing (e.g. runs.reset_wall); no data changes
sudo -u atlas npm run precreate -- 08075000,08073700,08069000,08068500 8   # policies for the 4 demo gauges
sudo -u atlas npm run preflight      # every FAIL must clear
```

Run precreate only after `PUBLIC_BASE_URL=https://atlasflood.us` is in `.env`: each policy's
metadata link is fixed when it is created. Then
open `https://atlasflood.us` on a phone on mobile data, press **Reset** on the admin page (the
token is stored in the browser), and run one full replay.

## Useful commands on the server

```bash
journalctl -u atlas-stack -f          # live logs of engine, chain, bot, gateway
systemctl restart atlas-stack         # restart everything
systemctl status caddy                # certificate or proxy problems
```

## If something is wrong

| Symptom | Likely cause |
| --- | --- |
| Caddy cannot get a certificate | DNS does not point here yet, or ports 80/443 are blocked (Vultr firewall). Use the `sslip.io` host meanwhile |
| `502` from the site | The stack is not up: `journalctl -u atlas-stack -n 50` |
| Engine fails at start | `/opt/atlas/.env` `DATABASE_URL` wrong, or Tiger blocks the server IP |
| Dashboard shows old pricing | `deploy.sh` not run since the last push |
