#!/usr/bin/env bash
# Pull, install, build the dashboard, render Caddy and restart the stack. Run as root on the server:
#   bash /opt/atlas/deploy/vultr/deploy.sh
set -euo pipefail
ROOT=/opt/atlas
cd "$ROOT"

sudo -u atlas git pull --ff-only
sudo -u atlas bash -c "cd chain && npm ci --no-audit --no-fund"
sudo -u atlas bash -c "cd web && npm ci --no-audit --no-fund"
sudo -u atlas "$ROOT/.venv/bin/pip" install --quiet -r engine/requirements.txt

# Dashboard for this host: same-origin API calls through the gateway (see chain/src/scripts/build-web.ts)
sudo -u atlas bash -c "cd chain && npm run web:build"

HOSTS=$(cat "$ROOT/deploy/vultr/.hosts")
PRIMARY=$(echo "$HOSTS" | cut -d, -f1 | xargs)
sed -e "s|__HOSTS__|$HOSTS|" deploy/vultr/Caddyfile.template > /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy || systemctl restart caddy

systemctl enable atlas-stack
systemctl restart atlas-stack
sleep 8
systemctl --no-pager --lines=8 status atlas-stack || true
echo "--- local health"
curl -fsS http://127.0.0.1:8080/health && echo
curl -fsS http://127.0.0.1:8080/engine/health && echo
echo "Live at: https://$PRIMARY   (check: curl https://$PRIMARY/health ; the reset must return 403:"
echo "  curl -X POST https://$PRIMARY/chain/reset -o /dev/null -w '%{http_code}\n')"
