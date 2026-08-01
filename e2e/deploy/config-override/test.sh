#!/bin/sh
# KB Labs — e2e proof that a release image has no fallback composition.
set -eu

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
IMAGE=kb-config-override-fixture
FIXTURES="$REPO_ROOT/e2e/deploy/config-override/fixtures"

cleanup() {
  if [ "${KEEP_IMAGE:-0}" != "1" ]; then
    docker rmi "$IMAGE" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

docker build -q -f "$REPO_ROOT/e2e/deploy/config-override/Dockerfile" -t "$IMAGE" "$REPO_ROOT" >/dev/null

if OUT="$(docker run --rm "$IMAGE" 2>&1)"; then
  echo "expected a release image without composition to fail" >&2
  exit 1
fi
printf '%s' "$OUT" | grep -F '/app/.kb/kb.config.json is required' >/dev/null

if OUT="$(docker run --rm \
  -v "$FIXTURES/kb.config.mounted-override.json:/app/.kb/kb.config.json:ro" \
  "$IMAGE" 2>&1)"; then
  echo "expected an image without lock to fail" >&2
  exit 1
fi
printf '%s' "$OUT" | grep -F '/app/.kb/marketplace.lock is required' >/dev/null

OUT="$(docker run --rm \
  -v "$FIXTURES/kb.config.mounted-override.json:/app/.kb/kb.config.json:ro" \
  -v "$FIXTURES/marketplace.default.lock:/app/.kb/marketplace.lock:ro" \
  "$IMAGE")"
printf '%s' "$OUT" | grep -F 'operator-mounted-override' >/dev/null
echo '[OK] release image requires an explicit config and lock'
