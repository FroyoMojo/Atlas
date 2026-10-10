#!/usr/bin/env bash
# One-time setup of a fresh Vultr Ubuntu 24.04 instance for Atlas. Run as root:
#   curl -fsSL https://raw.githubusercontent.com/FroyoMojo/Atlas/<branch>/deploy/setup-server.sh -o setup.sh
#   bash setup.sh <branch> <domain-or-empty>
# Then copy the keypairs and .env (see deploy/README.md) and run deploy.sh.
set -euo pipefail

BRANCH="${1:-main}"
DOMAIN="${2:-}"
ROOT=/opt/atlas
REPO=https://github.com/FroyoMojo/Atlas.git

apt-get update -y
apt-get install -y curl git ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https python3-venv

# Node 22
if ! command -v node >/dev/null || ! node -v | grep -q '^v22'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

# Caddy (official repository)
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y && apt-get install -y caddy
fi

# Service user and code
id atlas >/dev/null 2>&1 || useradd --system --create-home --shell /usr/sbin/nologin atlas
if [ ! -d "$ROOT/.git" ]; then
  git clone --branch "$BRANCH" "$REPO" "$ROOT"
fi
mkdir -p "$ROOT/secrets" && chmod 700 "$ROOT/secrets"
[ -f "$ROOT/.env" ] || cp "$ROOT/.env.example" "$ROOT/.env"
chown -R atlas:atlas "$ROOT"

# Firewall: SSH and web only
if command -v ufw >/dev/null; then
  ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw --force enable
fi

# Hostnames: the domain (if given) plus the sslip.io fallback for this IP
IP=$(curl -fsS https://api.ipify.org || hostname -I | awk '{print $1}')
SSLIP="$(echo "$IP" | tr . -).sslip.io"
HOSTS="$SSLIP"
[ -n "$DOMAIN" ] && HOSTS="$DOMAIN, $SSLIP"
echo "$HOSTS" > "$ROOT/deploy/.hosts"

cp "$ROOT"/deploy/systemd/atlas-chain.service "$ROOT"/deploy/systemd/atlas-bot.service /etc/systemd/system/
systemctl daemon-reload

cat <<MSG

Setup done. Hostnames: $HOSTS
Next (deploy/README.md):
  1. Edit $ROOT/.env (DATABASE_URL, SOLANA_RPC_URL, ADMIN_TOKEN, DEMO_WALLETS, PUBLIC_BASE_URL=https://${DOMAIN:-$SSLIP})
  2. Copy keypairs:  scp secrets/*.json root@$IP:$ROOT/secrets/  then  chown -R atlas:atlas $ROOT/secrets
  3. Copy chain state: scp chain/state/devnet.json root@$IP:$ROOT/chain/state/
  4. bash $ROOT/deploy/deploy.sh
MSG
