#!/bin/sh
# KB Labs — static verification for the kb-labs-platform Helm chart.
#
# Runs `helm lint` + a set of `helm template` assertions proving the
# render-time guardrails actually fire. Requires `helm`; does NOT require a
# live cluster (no `helm install`) — see README.md's "Verified, not yet
# live-tested" section for what that gap means.
#
# Usage (from this directory):
#   sh test.sh
#
# Exit 0 = all checks pass.

set -eu

PASS=0
FAIL=0
STEPS=""

pass() { PASS=$((PASS + 1)); STEPS="$STEPS\n  [OK]   $1"; echo "[OK]   $1"; }
fail() { FAIL=$((FAIL + 1)); STEPS="$STEPS\n  [FAIL] $1: $2"; echo "[FAIL] $1: $2"; }
summary() {
  echo ""
  echo "========================================"
  echo "  helm chart checks: $PASS passed, $FAIL failed"
  printf "%b\n" "$STEPS"
  echo "========================================"
}

# ── helm lint ────────────────────────────────────────────────────────────
if helm lint . --set image.tag=1.0.0 >/tmp/kb-helm-lint.out 2>&1; then
  pass "helm lint"
else
  fail "helm lint" "$(cat /tmp/kb-helm-lint.out)"
fi
rm -f /tmp/kb-helm-lint.out

# ── default values render cleanly with a tag set ────────────────────────
if helm template t . --set image.tag=1.0.0 >/dev/null 2>&1; then
  pass "default values render"
else
  fail "default values render" "helm template failed unexpectedly"
fi

# ── image.tag is required ───────────────────────────────────────────────
OUT="$(helm template t . 2>&1)" || true
case "$OUT" in
  *"image.tag is required"*) pass "missing image.tag fails the render with a clear message" ;;
  *) fail "missing image.tag fails the render with a clear message" "got: $OUT" ;;
esac

# ── workflow.replicas cannot exceed 1 ───────────────────────────────────
OUT="$(helm template t . --set image.tag=1.0.0 --set services.workflow.replicas=3 2>&1)" || true
case "$OUT" in
  *"must stay 1"*) pass "workflow.replicas>1 fails the render" ;;
  *) fail "workflow.replicas>1 fails the render" "got: $OUT" ;;
esac

# ── config unset -> no ConfigMap, no volumeMounts anywhere ─────────────
OUT="$(helm template t . --set image.tag=1.0.0 2>&1)"
if echo "$OUT" | grep -q "kind: ConfigMap"; then
  fail "no config -> no ConfigMap rendered" "a ConfigMap was rendered with no config/marketplaceLock set"
else
  pass "no config -> no ConfigMap rendered"
fi
if echo "$OUT" | grep -q "volumeMounts:"; then
  fail "no config -> no volumeMounts rendered" "a volumeMount was rendered with no config/marketplaceLock set"
else
  pass "no config -> no volumeMounts rendered"
fi

# ── config set -> ConfigMap + volumeMount appear ────────────────────────
OUT="$(helm template t . --set image.tag=1.0.0 --set-json 'config={"platform":{"adapters":{"cache":"@kb-labs/adapters-redis"}}}' 2>&1)"
case "$OUT" in
  *"kind: ConfigMap"*"@kb-labs/adapters-redis"*) pass "config set -> ConfigMap carries it" ;;
  *) fail "config set -> ConfigMap carries it" "ConfigMap missing or content wrong" ;;
esac
case "$OUT" in
  *"mountPath: /app/.kb/kb.config.json"*) pass "config set -> volumeMount appears" ;;
  *) fail "config set -> volumeMount appears" "no volumeMount for kb.config.json" ;;
esac

# ── disabling a service removes both its Deployment and Service ────────
OUT="$(helm template t . --set image.tag=1.0.0 --set services.studio.enabled=false 2>&1)"
if echo "$OUT" | grep -q "t-studio"; then
  fail "disabled service is fully absent" "found a rendered resource for the disabled service"
else
  pass "disabled service is fully absent"
fi

# ── marketplace-registry waits for state-daemon ─────────────────────────
OUT="$(helm template t . --set image.tag=1.0.0 --show-only templates/deployment.yaml 2>&1)"
case "$OUT" in
  *"wait-for-state-daemon"*) pass "marketplace-registry has a wait-for-state-daemon initContainer" ;;
  *) fail "marketplace-registry has a wait-for-state-daemon initContainer" "initContainer not found" ;;
esac

summary
[ "$FAIL" -eq 0 ]
