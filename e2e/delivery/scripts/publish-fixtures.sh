#!/usr/bin/env bash
# Publish the stub fixture packages to the local Verdaccio on :4873.
# Acquires an auth token via the Verdaccio REST API (curl PUT /-/user/),
# then uses npm publish with the token in a scoped .npmrc. Idempotent —
# "already published" responses are ignored.
set -euo pipefail

REG="${REG:-http://localhost:4873}"
REG_HOST="${REG#http://}"
REG_HOST="${REG_HOST#https://}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
USER="e2e"
PASS="e2e123"

echo "waiting for $REG ..."
for i in $(seq 1 60); do
  if curl -sf "$REG/-/ping" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

# Try creating the user (fresh Verdaccio) — on an existing instance the call
# falls through to login and still returns a token.
TOKEN=$(
  curl -sf -X PUT \
    -H "Content-Type: application/json" \
    -d "{\"_id\":\"org.couchdb.user:${USER}\",\"name\":\"${USER}\",\"password\":\"${PASS}\",\"type\":\"user\",\"roles\":[],\"date\":\"2024-01-01T00:00:00.000Z\"}" \
    "$REG/-/user/org.couchdb.user:${USER}" 2>/dev/null |
    python3 -c 'import sys,json;print(json.load(sys.stdin).get("token",""))' 2>/dev/null || true
)
if [ -z "${TOKEN:-}" ]; then
  TOKEN=$(
    curl -sf -u "${USER}:${PASS}" -X PUT \
      -H "Content-Type: application/json" \
      -d "{\"name\":\"${USER}\",\"password\":\"${PASS}\"}" \
      "$REG/-/user/org.couchdb.user:${USER}" 2>/dev/null |
      python3 -c 'import sys,json;print(json.load(sys.stdin).get("token",""))' 2>/dev/null || true
  )
fi
if [ -z "${TOKEN:-}" ]; then
  echo "could not acquire Verdaccio token" >&2
  exit 1
fi

# Per-invocation .npmrc, cleaned on exit.
NPMRC="$(mktemp)"
trap 'rm -f "$NPMRC"' EXIT
cat > "$NPMRC" <<EOF
registry=$REG
//${REG_HOST}/:_authToken=${TOKEN}
always-auth=true
EOF

for pkg in gateway-test adapter-noop; do
  dir="$HERE/fixtures/packages/$pkg"
  echo "publishing $pkg → $REG"
  (
    cd "$dir"
    set +e
    OUT=$(npm publish --userconfig "$NPMRC" 2>&1)
    CODE=$?
    set -e
    if [ "$CODE" -ne 0 ]; then
      if echo "$OUT" | grep -qi "409\|E409\|already\|EPUBLISHCONFLICT"; then
        echo "  (already published)"
      else
        echo "$OUT"
        exit "$CODE"
      fi
    fi
  )
done
echo "fixtures published."
