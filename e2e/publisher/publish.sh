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

echo "==> Publishing packages (pnpm publish for sha512 integrity)..."
PUBLISHED=0
FAILED=0

for tarball in /packages/*.tgz; do
  [ -f "$tarball" ] || continue
  pkg=$(basename "$tarball")

  # pnpm publish accepts tarball paths; --no-git-checks skips git workspace check
  OUTPUT=$(pnpm publish "$tarball" --registry "$REGISTRY" --no-git-checks 2>&1) && {
    echo "  ✓ $pkg"
    PUBLISHED=$((PUBLISHED + 1))
  } || {
    # Treat "already exists" as success (idempotent publish)
    if echo "$OUTPUT" | grep -qi "409\|E409\|already present\|already exists\|EPUBLISHCONFLICT\|is already published"; then
      echo "  ~ $pkg (already exists — skipped)"
      PUBLISHED=$((PUBLISHED + 1))
    else
      echo "  ✗ $pkg"
      echo "$OUTPUT" | grep -v "^npm notice" | head -3 | sed 's/^/    /'
      FAILED=$((FAILED + 1))
    fi
  }
done

echo "==> Published: $PUBLISHED  Failed: $FAILED"

if [ "$FAILED" -gt 0 ]; then
  echo "ERROR: Some packages failed to publish"
  exit 1
fi

echo "==> All packages ready in Verdaccio"
