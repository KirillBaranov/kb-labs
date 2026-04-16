#!/bin/sh
# KB Labs — End-to-end install flow test
#
# Runs the full user journey from scratch:
#   install → bootstrap → services → commit → scaffold → build → run
#
# Exit 0 = all steps pass. Non-zero = failure with step name.
# Designed to run inside Docker (node:20-bullseye or similar).
#
# Usage:
#   docker build -t kb-e2e -f e2e/install-flow/Dockerfile .
#   docker run --rm kb-e2e

set -eu

PASS=0
FAIL=0
STEPS=""

pass() { PASS=$((PASS + 1)); STEPS="$STEPS\n  ✅ $1"; echo "✅ $1"; }
fail() { FAIL=$((FAIL + 1)); STEPS="$STEPS\n  ❌ $1: $2"; echo "❌ $1: $2"; }

# ── Step 1: Install kb-create ──────────────────────────────────────────
echo "── Step 1: Install kb-create"
if curl -fsSL https://kblabs.ru/install.sh | sh > /tmp/install.log 2>&1; then
  export PATH="$HOME/.local/bin:$PATH"
  if command -v kb-create > /dev/null 2>&1; then
    pass "install.sh → kb-create $(kb-create --version 2>&1 | head -1)"
  else
    fail "install.sh" "binary not in PATH after install"
  fi
else
  fail "install.sh" "curl | sh failed (exit $?)"
  cat /tmp/install.log
fi

# ── Step 2: Bootstrap project ──────────────────────────────────────────
echo "── Step 2: Bootstrap project"
mkdir -p /tmp/work && cd /tmp/work
if kb-create my-project --yes > /tmp/bootstrap.log 2>&1; then
  pass "kb-create my-project"
else
  fail "kb-create" "bootstrap failed (exit $?)"
  tail -20 /tmp/bootstrap.log
fi

# ── Step 3: Verify installation ────────────────────────────────────────
echo "── Step 3: Verify installation"
if kb-create status > /tmp/status.log 2>&1; then
  PLUGINS=$(grep -c "●" /tmp/status.log || true)
  if [ "$PLUGINS" -ge 5 ]; then
    pass "kb-create status ($PLUGINS components)"
  else
    fail "kb-create status" "only $PLUGINS components found (expected 5+)"
  fi
else
  fail "kb-create status" "command failed"
fi

# ── Step 4: Check kb-dev binary ────────────────────────────────────────
echo "── Step 4: Check kb-dev binary"
if command -v kb-dev > /dev/null 2>&1; then
  pass "kb-dev installed ($(kb-dev --version 2>&1 | head -1))"
else
  fail "kb-dev" "binary not found after bootstrap"
fi

# ── Step 5: Check CLI shows plugins ────────────────────────────────────
echo "── Step 5: Check CLI plugins"
cd /tmp/work/my-project
if kb --help > /tmp/help.log 2>&1; then
  if grep -q "commit" /tmp/help.log && grep -q "scaffold" /tmp/help.log; then
    pass "kb --help shows commit + scaffold"
  else
    fail "kb --help" "missing expected plugins"
  fi
else
  fail "kb --help" "command failed"
fi

# ── Step 6: AI commit (LLM through gateway) ───────────────────────────
echo "── Step 6: AI commit"
git init > /dev/null 2>&1
git config user.email "e2e@test" && git config user.name "E2E"
cat > app.ts << 'TSEOF'
export function greet(name: string) { return `Hello, ${name}`; }
TSEOF
git add . && git commit -m "init" > /dev/null 2>&1

cat >> app.ts << 'TSEOF'
export function farewell(name: string) { return `Goodbye, ${name}`; }
TSEOF
git add .

COMMIT_OUT=$(kb commit commit --dry-run 2>&1 || true)
if echo "$COMMIT_OUT" | grep -q "LLM: Phase"; then
  LLM_LINE=$(echo "$COMMIT_OUT" | grep "LLM:" | head -1)
  PLAN_LINE=$(echo "$COMMIT_OUT" | grep "Planned Commits" -A1 | tail -1 | sed 's/^[│ ]*//')
  pass "AI commit: $LLM_LINE → $PLAN_LINE"
elif echo "$COMMIT_OUT" | grep -q "Heuristics"; then
  fail "AI commit" "fell back to heuristics (LLM not reached)"
else
  fail "AI commit" "unexpected output"
fi

# ── Step 7: Scaffold plugin ───────────────────────────────────────────
echo "── Step 7: Scaffold plugin"
if kb scaffold run plugin demo --yes > /tmp/scaffold.log 2>&1; then
  pass "kb scaffold run plugin demo"
else
  fail "scaffold" "command failed"
  tail -10 /tmp/scaffold.log
fi

# ── Step 8: Build plugin ──────────────────────────────────────────────
echo "── Step 8: Build plugin"
cd .kb/plugins/demo
if pnpm install > /tmp/plugin-install.log 2>&1 && pnpm build > /tmp/plugin-build.log 2>&1; then
  if [ -f packages/demo-entry/dist/manifest.js ]; then
    pass "plugin build (dist/manifest.js exists)"
  else
    fail "plugin build" "dist/manifest.js missing"
  fi
else
  fail "plugin build" "install or build failed"
  tail -10 /tmp/plugin-build.log
fi

# ── Step 9: Run plugin command ────────────────────────────────────────
echo "── Step 9: Run plugin"
cd /tmp/work/my-project
kb marketplace clear-cache > /dev/null 2>&1
HELLO_OUT=$(kb demo hello --who=E2E 2>&1 || true)
if echo "$HELLO_OUT" | grep -q "Hello, E2E from demo"; then
  pass "kb demo hello --who=E2E"
else
  fail "plugin run" "unexpected output: $HELLO_OUT"
fi

# ── Summary ───────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════"
echo "  KB Labs E2E: $PASS passed, $FAIL failed"
printf "$STEPS\n"
echo "════════════════════════════════════════"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
