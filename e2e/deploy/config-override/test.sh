#!/bin/sh
# KB Labs — e2e proof for the ADR-0037 config-override mechanism.
#
# Builds a fixture image around the REAL docker-entrypoint.sh shipped in
# services/gateway/app/ (same file, not a copy of its logic) and proves the
# one claim the whole "containers are the canonical cloud delivery path"
# decision rests on: an operator-mounted config always wins over the baked
# default, without a rebuild, and the baked default is never silently
# overwritten once a live file exists.
#
# Usage (from repo root):
#   e2e/deploy/config-override/test.sh
#
# Exit 0 = all scenarios pass. Non-zero = failure with scenario name.

set -eu

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
IMAGE=kb-config-override-fixture
FIXTURES="$REPO_ROOT/e2e/deploy/config-override/fixtures"
SCRATCH="$REPO_ROOT/e2e/deploy/config-override/.scratch"

# Per docs/deployment/docker-build-hygiene.md: test/fixture images must not
# outlive the test run. Runs on both pass and fail (EXIT trap), unless
# KEEP_IMAGE=1 is set for manual debugging.
cleanup() {
  rm -rf "$SCRATCH"
  if [ "${KEEP_IMAGE:-0}" != "1" ]; then
    docker rmi "$IMAGE" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

PASS=0
FAIL=0
STEPS=""

pass() { PASS=$((PASS + 1)); STEPS="$STEPS\n  [OK]   $1"; echo "[OK]   $1"; }
fail() { FAIL=$((FAIL + 1)); STEPS="$STEPS\n  [FAIL] $1: $2"; echo "[FAIL] $1: $2"; }
summary() {
  echo ""
  echo "========================================"
  echo "  config-override e2e: $PASS passed, $FAIL failed"
  printf "%b\n" "$STEPS"
  echo "========================================"
}

echo "Building fixture image (reuses services/gateway/app/docker-entrypoint.sh)..."
docker build -q -f "$REPO_ROOT/e2e/deploy/config-override/Dockerfile" -t "$IMAGE" "$REPO_ROOT" >/dev/null

# ── Scenario 1: no mount → baked default composition is applied ────────────
OUT="$(docker run --rm "$IMAGE" 2>&1)" || true
case "$OUT" in
  *baked-default*) pass "no mount -> baked default composition applied" ;;
  *) fail "no mount -> baked default composition applied" "got: $OUT" ;;
esac

# ── Scenario 2: operator mounts a config -> it wins, no rebuild needed ─────
OUT="$(docker run --rm -v "$FIXTURES/kb.config.mounted-override.json:/app/.kb/kb.config.json:ro" "$IMAGE" 2>&1)" || true
case "$OUT" in
  *operator-mounted-override*) pass "mounted config -> operator override wins over baked default" ;;
  *) fail "mounted config -> operator override wins over baked default" "got: $OUT" ;;
esac

# ── Scenario 3: idempotency — a live file is never clobbered by re-runs ────
# Run the SAME container twice against the same named volume: first run seeds
# the volume from the baked default (entrypoint applies it since nothing is
# there yet); if entrypoint ever stopped checking "already exists" and
# re-copied the default unconditionally, this would be undetectable from
# scenario 1 alone. Simulate persistence with a bind-mounted scratch file
# pre-seeded with a THIRD marker the image has never shipped, proving the
# entrypoint truly skips an existing file rather than merely being lucky.
# Deliberately NOT mktemp / $TMPDIR / plain /tmp: on this Docker Desktop
# install (and reportedly common on macOS), bind-mounting a file from
# outside Docker Desktop's shared-paths list silently produces an empty
# DIRECTORY at the container target instead of failing loudly — confirmed by
# comparing `-v` (silently wrong) against `--mount type=bind` (correctly
# errors "source path does not exist") against the same /tmp path. A path
# inside the repo is reliably shared, since the build context itself comes
# from here.
mkdir -p "$SCRATCH"
printf '{"platform":{"adapters":{"marker":"pre-existing-untouched"}}}' > "$SCRATCH/kb.config.json"
OUT="$(docker run --rm -v "$SCRATCH/kb.config.json:/app/.kb/kb.config.json" "$IMAGE" 2>&1)" || true
case "$OUT" in
  *pre-existing-untouched*) pass "existing live file is never overwritten by the baked default" ;;
  *) fail "existing live file is never overwritten by the baked default" "got: $OUT" ;;
esac

summary
[ "$FAIL" -eq 0 ]
