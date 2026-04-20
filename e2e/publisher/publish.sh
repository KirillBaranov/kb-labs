#!/bin/sh
# Publish all @kb-labs/*.tgz tarballs to Verdaccio.
# Runs once and exits 0 — Docker Compose waits for this to complete
# before starting the platform container.
set -e

REGISTRY="${VERDACCIO_URL:-http://verdaccio:4873}"

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

# Configure npm registry
npm config set registry "$REGISTRY"

# Create a publish user (non-interactive via Verdaccio REST API).
# Ignore failures — user may already exist on a warm Docker layer cache.
curl -sf -X PUT \
  -H "Content-Type: application/json" \
  -d "{\"_id\":\"org.couchdb.user:e2e\",\"name\":\"e2e\",\"password\":\"e2e123\",\"type\":\"user\",\"roles\":[],\"date\":\"2024-01-01T00:00:00.000Z\"}" \
  "$REGISTRY/-/user/org.couchdb.user:e2e" \
  -o /tmp/verdaccio-auth.json 2>/dev/null || true

# Extract token from Verdaccio response
TOKEN=$(cat /tmp/verdaccio-auth.json 2>/dev/null | \
  python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('token',''))" 2>/dev/null || echo "")

if [ -n "$TOKEN" ]; then
  # Set auth token for registry
  REGISTRY_HOST="${REGISTRY#http://}"
  REGISTRY_HOST="${REGISTRY_HOST#https://}"
  npm config set "//${REGISTRY_HOST}/:_authToken" "$TOKEN"
  echo "    Auth token acquired"
else
  echo "    No token returned — attempting anonymous publish (requires publish:\$all in Verdaccio config)"
fi

echo "==> Publishing packages..."
PUBLISHED=0
FAILED=0

for tarball in /packages/*.tgz; do
  [ -f "$tarball" ] || continue
  pkg=$(basename "$tarball")

  # Publish — ignore 409 Conflict (package already exists)
  OUTPUT=$(npm publish "$tarball" --registry "$REGISTRY" --no-git-checks 2>&1) && {
    echo "  ✓ $pkg"
    PUBLISHED=$((PUBLISHED + 1))
  } || {
    if echo "$OUTPUT" | grep -q "409\|already exists\|EPUBLISHCONFLICT"; then
      echo "  ~ $pkg (already exists — skipped)"
      PUBLISHED=$((PUBLISHED + 1))
    else
      echo "  ✗ $pkg — $OUTPUT"
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
