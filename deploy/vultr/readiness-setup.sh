#!/usr/bin/env bash
# One command from "main has the new code" to "the site is ready for the readiness demo".
# Run as root on the server (see docs/readiness.md, Production runbook):
#   bash /opt/atlas/deploy/vultr/readiness-setup.sh <sponsorPhoneAddress> [judgePhoneAddress ...]
#
# In order: pull the code, set the demo env, fund and allowlist the demo wallets, deploy (build and
# restart), Reset the demo, shrink the vault to 600 aUSD, then print the pool so you can check it.
# Safe to re-run: every step is idempotent. It stops at the first failure.
# Skip the shrink with SKIP_SHRINK=1 (the vault then stays at its current balance).
set -euo pipefail

ROOT=/opt/atlas
ENVFILE="$ROOT/.env"
VAULT_TARGET=600
SEED=300
GATEWAY=http://127.0.0.1:8080

[ "$(id -u)" = 0 ] || { echo "run as root"; exit 1; }
[ $# -ge 1 ] || { echo "usage: bash $0 <sponsorPhoneAddress> [judgePhoneAddress ...]"; exit 1; }
[ -f "$ENVFILE" ] || { echo "missing $ENVFILE"; exit 1; }
SPONSOR="$1"; shift
JUDGES=("$@")

get_env() { grep -E "^$1=" "$ENVFILE" | tail -n1 | cut -d= -f2- | tr -d '"' | tr -d "'" || true; }
set_env() { # set_env KEY VALUE: replace the line if present, else append
  if grep -qE "^$1=" "$ENVFILE"; then sed -i "s|^$1=.*|$1=$2|" "$ENVFILE"; else echo "$1=$2" >> "$ENVFILE"; fi
}
atlas() { sudo -u atlas bash -c "cd $ROOT/chain && $*"; }

echo "=== 1/7 Guard: no replay may be running"
STATUS=$(curl -fsS "$GATEWAY/engine/replay/status" | grep -o '"status":"[a-z]*"' | head -n1 || true)
echo "replay status: ${STATUS:-none}"
if echo "$STATUS" | grep -q running; then echo "a replay is running: wait for it to finish, then re-run"; exit 1; fi

echo "=== 2/7 Pull the code and install chain dependencies (needed for the wallets script)"
sudo -u atlas bash -c "cd $ROOT && git pull --ff-only"
atlas "npm ci --no-audit --no-fund"

echo "=== 3/7 Demo env"
set_env SNAPSHOT_VAULT "$VAULT_TARGET"
set_env SEED_RESERVE "$SEED"
set_env READINESS_PRICING true
set_env MAX_DONATION 2000
grep -E "^(SNAPSHOT_VAULT|SEED_RESERVE|READINESS_PRICING|MAX_DONATION)=" "$ENVFILE"

echo "=== 4/7 Fund and allowlist the demo wallets"
FUND_ARGS=("$SPONSOR:3000")
ROLE_ARGS=("$SPONSOR:sponsor")
for j in "${JUDGES[@]}"; do FUND_ARGS+=("$j:1000"); ROLE_ARGS+=("$j:household"); done
atlas "npm run --silent fund -- ${FUND_ARGS[*]}"
OUT=$(atlas "npm run --silent wallets -- ${ROLE_ARGS[*]}")
echo "$OUT"
NEW=$(echo "$OUT" | grep -E '^DEMO_WALLETS=' | head -n1 | cut -d= -f2-)
[ -n "$NEW" ] || { echo "could not read the DEMO_WALLETS line"; exit 1; }
# Union with what is already allowed, so wallets added earlier (Jesse's phone) are kept.
MERGED=$(printf '%s,%s' "$(get_env DEMO_WALLETS)" "$NEW" | tr ',' '\n' | awk 'NF && !seen[$0]++' | paste -sd, -)
set_env DEMO_WALLETS "$MERGED"
echo "DEMO_WALLETS now has $(echo "$MERGED" | tr ',' '\n' | wc -l) wallets"

echo "=== 5/7 Deploy (pull, build the site, restart the stack with the new env)"
bash "$ROOT/deploy/vultr/deploy.sh"

echo "=== 6/7 Reset the demo, then shrink the vault to $VAULT_TARGET"
TOKEN=$(get_env ADMIN_TOKEN)
[ -n "$TOKEN" ] || { echo "ADMIN_TOKEN is not set in $ENVFILE"; exit 1; }
CODE=$(curl -sS -o /tmp/atlas-reset.json -w '%{http_code}' -X POST "$GATEWAY/engine/replay/reset" -H "X-Admin-Token: $TOKEN")
if [ "$CODE" = 200 ]; then echo "reset ok"; elif [ "$CODE" = 409 ]; then echo "nothing to reset yet (no run): skipping"; else echo "reset failed ($CODE):"; cat /tmp/atlas-reset.json; exit 1; fi
if [ "${SKIP_SHRINK:-}" = 1 ]; then
  echo "SKIP_SHRINK=1: leaving the vault as it is"
else
  atlas "npm run shrink:vault -- $VAULT_TARGET"
fi

echo "=== 7/7 Check"
atlas "npm run --silent status" || true
echo "--- readiness (expect pricing_mode readiness, funds_usd $VAULT_TARGET, cover_sold_usd 0)"
curl -fsS "$GATEWAY/engine/readiness" | head -c 700; echo
echo "--- pool (expect reconciled true)"
curl -fsS "$GATEWAY/engine/pool" | grep -o '"reconciled":[a-z]*'
echo
echo "Done. Next: buy four policies on Brays (docs/readiness.md step 6)."
