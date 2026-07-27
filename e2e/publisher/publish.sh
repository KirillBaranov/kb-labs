#!/bin/sh
# Publish all @kb-labs/*.tgz tarballs to Verdaccio using pnpm.
# pnpm publish writes sha512 integrity hashes; npm publish writes sha1,
# which causes ERR_PNPM_TARBALL_INTEGRITY on the consuming side.
#
# Idempotent: runs safely on warm Verdaccio volumes (packages already exist).
# Runs once and exits 0 — Docker Compose waits for this to complete
# before starting the platform container.
set -e

REGISTRY="${VERDACCIO_URL:-http://verdaccio:4873}"
REGISTRY_HOST="${REGISTRY#http://}"
REGISTRY_HOST="${REGISTRY_HOST#https://}"

USER="e2e"
PASS="e2e123"

echo "==> Waiting for Verdaccio at $REGISTRY ..."
ATTEMPTS=0
until curl -sf "$REGISTRY/-/ping" > /dev/null 2>&1; do
  ATTEMPTS=$((ATTEMPTS + 1))
  if [ "$ATTEMPTS" -ge 60 ]; then
    echo "ERROR: Verdaccio did not become ready after 60s"
    exit 1
  fi
  sleep 1
done
echo "    Verdaccio ready after ${ATTEMPTS}s"

# Get auth token — try creating user first, fall back to basic-auth login.
get_token() {
  # 1. Try to create user (succeeds on fresh Verdaccio)
  CREATE_RESP=$(curl -sf -X PUT \
    -H "Content-Type: application/json" \
    -d "{\"_id\":\"org.couchdb.user:${USER}\",\"name\":\"${USER}\",\"password\":\"${PASS}\",\"type\":\"user\",\"roles\":[],\"date\":\"2024-01-01T00:00:00.000Z\"}" \
    "$REGISTRY/-/user/org.couchdb.user:${USER}" 2>/dev/null || echo "{}")
  TOKEN=$(echo "$CREATE_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('token',''))" 2>/dev/null || echo "")
  [ -n "$TOKEN" ] && echo "$TOKEN" && return

  # 2. User already exists — re-login to get a token
  LOGIN_RESP=$(curl -sf -u "${USER}:${PASS}" \
    -X PUT \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"${USER}\",\"password\":\"${PASS}\"}" \
    "$REGISTRY/-/user/org.couchdb.user:${USER}" 2>/dev/null || echo "{}")
  TOKEN=$(echo "$LOGIN_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('token',''))" 2>/dev/null || echo "")
  echo "$TOKEN"
}

TOKEN=$(get_token)

if [ -n "$TOKEN" ]; then
  pnpm config set "//${REGISTRY_HOST}/:_authToken" "$TOKEN" 2>/dev/null || true
  echo "    Auth token acquired"
else
  # Last resort: use basic-auth (base64-encoded user:pass) in pnpm config
  B64=$(echo -n "${USER}:${PASS}" | base64)
  pnpm config set "//${REGISTRY_HOST}/:_auth" "$B64" 2>/dev/null || true
  pnpm config set "//${REGISTRY_HOST}/:username" "$USER" 2>/dev/null || true
  echo "    Using basic-auth (no token available)"
fi

PARALLELISM="${PUBLISH_PARALLELISM:-4}"
echo "==> Publishing packages (pnpm publish for sha512 integrity, parallel x${PARALLELISM})..."

# Each pnpm publish handshakes with Verdaccio per package. Sequential
# loop over 160+ tarballs takes ~160s of mostly-idle waiting. Running
# a small parallel pool keeps Verdaccio's request queue full without
# overwhelming it. Tunable via PUBLISH_PARALLELISM env.
#
# xargs is the most portable parallel primitive available in /bin/sh.
# The worker is inlined into `sh -c` since POSIX sh lacks `export -f`.

publish_set() {
  set_dir="$1"
  find "$set_dir" -maxdepth 1 -type f -name '*.tgz' -print 2>/dev/null | sort
}

# Worker: published-or-409 → echo ✓/~ and exit 0; anything else → exit 1.
# REGISTRY is exported above; the worker reads it from env.
WORKER='
  tarball="$1"
  pkg=$(basename "$tarball")
  OUTPUT=$(pnpm publish "$tarball" --registry "$REGISTRY" --no-git-checks 2>&1) && {
    echo "  ✓ $pkg"
    exit 0
  } || true
  if echo "$OUTPUT" | grep -qi "409\|E409\|already present\|already exists\|EPUBLISHCONFLICT\|is already published"; then
    echo "  ~ $pkg (already exists — skipped)"
    exit 0
  fi
  echo "  ✗ $pkg"
  echo "$OUTPUT" | grep -v "^npm notice" | head -3 | sed "s/^/    /"
  exit 1
'

export REGISTRY

publish_tarballs() {
  set_dir="$1"
  tarballs="$(publish_set "$set_dir")"
  [ -n "$(echo "$tarballs" | tr -d '[:space:]')" ] || return 0
  total=$(echo "$tarballs" | sed '/^$/d' | wc -l | tr -d ' ')
  if echo "$tarballs" | xargs -n 1 -P "$PARALLELISM" -I {} sh -c "$WORKER" _ {}; then
    echo "==> Published $set_dir: $total  Failed: 0"
  else
    echo "==> ERROR: at least one package failed to publish from $set_dir"
    exit 1
  fi
}

# In the PR fast lane publish the PR overlay as a complete phase first.
# Verdaccio rejects a second publish of the same version, so publishing base
# afterwards leaves the PR tarball active for changed packages while filling
# all unchanged ones. Keeping phases separate avoids an xargs race.
if [ -d /packages/pr ]; then
  publish_tarballs /packages/pr
  publish_tarballs /packages/base
else
  publish_tarballs /packages
fi

echo "==> All packages ready in Verdaccio"
