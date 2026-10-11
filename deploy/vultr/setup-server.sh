#!/usr/bin/env bash
# One-time setup of a fresh Vultr Ubuntu 22.04 or 24.04 instance for Atlas. Run as root:
#   curl -fsSL https://raw.githubusercontent.com/FroyoMojo/Atlas/main/deploy/vultr/setup-server.sh -o setup.sh
#   bash setup.sh atlasflood.us
# Then copy secrets and .env (deploy/vultr/README.md step 4) and run deploy.sh.
#
# Layout: Caddy (HTTPS, ports 80/443) -> gateway 127.0.0.1:8080 -> engine :8000 / chain :8787,
# dashboard from web/dist. Everything but Caddy listens on localhost only.
set -euo pipefail

DOMAIN="${1:-}"                       # e.g. atlasflood.us ; empty = sslip.io hostname only
BRANCH="${2:-main}"
ROOT=/opt/atlas
REPO=https://github.com/FroyoMojo/Atlas.git

[ "$(id -u)" = 0 ] || { echo "run as root"; exit 1; }
export DEBIAN_FRONTEND=noninteractive

apt-get update -y
apt-get install -y curl git ca-certificates gnupg debian-keyring debian-archive-keyring \
  apt-transport-https python3 python3-venv python3-pip ufw

# Node 22
if ! command -v node >/dev/null || ! node -v | grep -q '^v22'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

# Caddy. Ubuntu's own package first (the third-party Caddy apt repo started returning
# "402 Payment Required"); if the distro has none, the .deb from Caddy's GitHub release.
rm -f /etc/apt/sources.list.d/caddy-stable.list /usr/share/keyrings/caddy-stable-archive-keyring.gpg
if ! command -v caddy >/dev/null; then
  apt-get update -y || true
  apt-get install -y caddy || true
fi
if ! command -v caddy >/dev/null; then
  DEB_URL=$(curl -fsSL https://api.github.com/repos/caddyserver/caddy/releases/latest \
    | grep -o 'https://[^"]*linux_amd64\.deb' | head -1)
  curl -fsSL "$DEB_URL" -o /tmp/caddy.deb && apt-get install -y /tmp/caddy.deb
fi
command -v caddy >/dev/null || { echo "Caddy install failed"; exit 1; }

# Service user and code
id atlas >/dev/null 2>&1 || useradd --system --create-home --shell /usr/sbin/nologin atlas
if [ ! -d "$ROOT/.git" ]; then
  git clone --branch "$BRANCH" "$REPO" "$ROOT"
fi
mkdir -p "$ROOT/secrets" && chmod 700 "$ROOT/secrets"
[ -f "$ROOT/.env" ] || cp "$ROOT/.env.example" "$ROOT/.env"
chown -R atlas:atlas "$ROOT"
chmod 600 "$ROOT/.env"

# Python environment for the engine
sudo -u atlas python3 -m venv "$ROOT/.venv"
sudo -u atlas "$ROOT/.venv/bin/pip" install --quiet -r "$ROOT/engine/requirements.txt"

# Firewall: SSH and web only
ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw --force enable

# Small plans: building the dashboard next to the running stack can run out of memory. Add 2 GB
# of swap when the machine has under 3 GB of RAM (once).
if [ "$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)" -lt 3000 ] && [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# Hostnames: the domain (and www) if given, plus the sslip.io fallback for this IP
IP=$(curl -fsS https://api.ipify.org || hostname -I | awk '{print $1}')
SSLIP="$(echo "$IP" | tr . -).sslip.io"
HOSTS="$SSLIP"
[ -n "$DOMAIN" ] && HOSTS="$DOMAIN, www.$DOMAIN, $SSLIP"
echo "$HOSTS" > "$ROOT/deploy/vultr/.hosts"
chown atlas:atlas "$ROOT/deploy/vultr/.hosts"

cp "$ROOT/deploy/vultr/atlas-stack.service" /etc/systemd/system/
systemctl daemon-reload

cat <<MSG

Setup done. This server's IP: $IP
Hostnames Caddy will serve: $HOSTS
Next (deploy/vultr/README.md):
  - DNS: at the domain's DNS host, A record  ${DOMAIN:-<your domain>}  ->  $IP
  - Copy the keypairs:  scp -r secrets root@$IP:$ROOT/    (from the machine that has secrets/)
  - Edit $ROOT/.env  (DATABASE_URL, ADMIN_TOKEN, SOLANA_RPC_URL, DEMO_WALLETS, PUBLIC_BASE_URL=https://${DOMAIN:-$SSLIP}, TERM_DAYS=90)
  - bash $ROOT/deploy/vultr/deploy.sh
MSG
