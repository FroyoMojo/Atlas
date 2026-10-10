#!/usr/bin/env bash
# Pull, install, build the web app for this host, render Caddy, restart services. Run as root.
set -euo pipefail
ROOT=/opt/atlas
cd "$ROOT"

sudo -u atlas git pull --ff-only
sudo -u atlas bash -c "cd chain && npm ci --no-audit --no-fund"
sudo -u atlas bash -c "cd web && npm ci --no-audit --no-fund"

# Web build settings come from the server's .env, so the bundle points at this host.
set -a; . "$ROOT/.env"; set +a
HOSTS=$(cat "$ROOT/deploy/.hosts")
PRIMARY=$(echo "$HOSTS" | cut -d, -f1 | xargs)
AUSD_MINT=$(python3 -c "import json;print(json.load(open('$ROOT/chain/state/devnet.json')).get('ausdMint',''))" 2>/dev/null || true)
cat > web/.env.production.local <<ENV
VITE_USE_MOCKS=${VITE_USE_MOCKS:-false}
VITE_ENGINE_URL=https://$PRIMARY/engine
VITE_CHAIN_URL=https://$PRIMARY
VITE_RPC_URL=${SOLANA_RPC_URL:-https://api.devnet.solana.com}
VITE_AUSD_MINT=$AUSD_MINT
VITE_EXPLORER_CLUSTER=devnet
VITE_PURCHASE_FLOW=${PURCHASE_FLOW:-a}
ENV
chown atlas:atlas web/.env.production.local
sudo -u atlas bash -c "cd web && npm run build"

sed -e "s|__HOSTS__|$HOSTS|" -e "s|__ROOT__|$ROOT|" deploy/Caddyfile.template > /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy || systemctl restart caddy

systemctl enable --now atlas-chain atlas-bot
systemctl restart atlas-chain atlas-bot
sleep 3
systemctl --no-pager --lines=3 status atlas-chain atlas-bot || true
curl -fsS "http://127.0.0.1:8787/health" && echo
echo "Live at: https://$PRIMARY  (phone view: https://$PRIMARY/#/phone?owner=<address>)"
