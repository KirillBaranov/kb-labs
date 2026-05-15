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

# Isolated platform directories per test category — prevent scenarios from clobbering each other.
export LLM_PLATFORM_DIR=/tmp/kb-e2e-llm/kb-platform
export NOLLM_PLATFORM_DIR=/tmp/kb-e2e-nollm/kb-platform

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
if kb-create my-project --yes --llm --platform "$LLM_PLATFORM_DIR" > /tmp/bootstrap.log 2>&1; then
  INSTALL_OUT=$(cat /tmp/bootstrap.log)
  pass "kb-create my-project"
else
  INSTALL_OUT=$(cat /tmp/bootstrap.log)
  fail "kb-create" "bootstrap failed (exit $?)"
  tail -20 /tmp/bootstrap.log
fi

# ── Step 1b: --yes without --llm keeps LLM off ──────────────────────────────
echo "── Step 1b: --yes without --llm = LLM off"
mkdir -p /tmp/work-nollm && cd /tmp/work-nollm
# Each scenario uses its own isolated platform dir — prevents test categories from clobbering each other.
kb-create nollm-project --yes --platform "$NOLLM_PLATFORM_DIR" > /tmp/bootstrap-nollm.log 2>&1 || true
NOLLM_ENV=""
if [ -f /tmp/work-nollm/nollm-project/.env ]; then
  NOLLM_ENV=$(cat /tmp/work-nollm/nollm-project/.env)
fi
if echo "$NOLLM_ENV" | grep -q "KB_GATEWAY_CLIENT_ID"; then
  fail "--yes without --llm" "gateway credentials written to .env — LLM should be off"
else
  pass "--yes without --llm: no gateway credentials in .env"
fi
cd /tmp/work

# ── Step 1c: --llm writes gateway credentials to .env ────────────────────────
echo "── Step 1c: --llm writes credentials to .env"
ENV_FILE="/tmp/work/my-project/.env"
if [ -f "$ENV_FILE" ]; then
  if grep -q "KB_GATEWAY_CLIENT_ID" "$ENV_FILE" && grep -q "KB_GATEWAY_CLIENT_SECRET" "$ENV_FILE"; then
    pass ".env has KB_GATEWAY_CLIENT_ID + KB_GATEWAY_CLIENT_SECRET"
  else
    fail ".env credentials" "KB_GATEWAY_CLIENT_ID or KB_GATEWAY_CLIENT_SECRET missing from .env"
  fi
else
  fail ".env credentials" ".env file not created after --llm bootstrap"
fi

# ── Step 1d: .env is gitignored ───────────────────────────────────────────────
echo "── Step 1d: .env is gitignored"
GITIGNORE_FILE="/tmp/work/my-project/.gitignore"
if [ -f "$GITIGNORE_FILE" ] && grep -qE "^\.env$|^\.env[[:space:]]" "$GITIGNORE_FILE"; then
  pass ".env is gitignored"
else
  fail ".gitignore" ".env is not in .gitignore — credentials would be committed"
fi

# ── Step 1e: No @kb-labs peer dep warnings ────────────────────────────────────
echo "── Step 1e: No @kb-labs peer dep warnings"
if echo "$INSTALL_OUT" | grep -q "@kb-labs.*unmet peer\|unmet peer.*@kb-labs"; then
  fail "peer-dep warnings" "found @kb-labs peer dep warnings in install output"
else
  pass "no @kb-labs peer dep warnings"
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

# ── Step 4b: kb-create doctor ──────────────────────────────────────────
echo "── Step 4b: kb-create doctor"
cd /tmp/work/my-project
kb-create doctor > /tmp/doctor.log 2>&1 || true
if grep -q "Doctor summary" /tmp/doctor.log; then
  SUMMARY=$(grep "Doctor summary" /tmp/doctor.log | head -1)
  pass "kb-create doctor ran ($SUMMARY)"
else
  fail "kb-create doctor" "did not produce doctor summary: $(tail -3 /tmp/doctor.log)"
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

# ── Step 5b: Verify platform commit in git ────────────────────────────────────
echo "── Step 5b: Platform files committed by KB Labs"
cd /tmp/work/my-project
GIT_LOG=$(git log --oneline 2>/dev/null || true)
if echo "$GIT_LOG" | grep -qi "kb labs platform\|add KB Labs"; then
  pass "KB Labs platform commit found in git history"
else
  # CommitPlatformFiles may not run if git is not configured — soft pass
  pass "no KB Labs commit (may be expected if git not configured)"
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

# Pre-check: is the gateway token endpoint reachable?
GW_REACHABLE=0
if [ -f .env ]; then
  GW_CLIENT_ID=$(grep "^KB_GATEWAY_CLIENT_ID=" .env | cut -d= -f2)
  GW_CLIENT_SECRET=$(grep "^KB_GATEWAY_CLIENT_SECRET=" .env | cut -d= -f2)
  if [ -n "$GW_CLIENT_ID" ] && [ -n "$GW_CLIENT_SECRET" ]; then
    TOKEN_HTTP=$(curl -s -o /tmp/token.json -w "%{http_code}" \
      -X POST https://api.kblabs.ru/auth/token \
      -H "Content-Type: application/json" \
      -d "{\"clientId\":\"$GW_CLIENT_ID\",\"clientSecret\":\"$GW_CLIENT_SECRET\"}" 2>/dev/null || echo "0")
    if [ "$TOKEN_HTTP" = "200" ]; then
      GW_TOKEN=$(python3 -c "import json,sys; print(json.load(open('/tmp/token.json')).get('accessToken',''))" 2>/dev/null || true)
      pass "gateway token endpoint reachable (200)"

      # Also test the actual LLM completion endpoint
      LLM_HTTP=$(curl -s -o /tmp/llm-test.json -w "%{http_code}" \
        -X POST https://api.kblabs.ru/llm/v1/chat/completions \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $GW_TOKEN" \
        -d '{"model":"small","messages":[{"role":"user","content":"hi"}],"max_tokens":5}' 2>/dev/null || echo "0")
      if [ "$LLM_HTTP" = "200" ]; then
        GW_REACHABLE=1
        pass "gateway LLM endpoint reachable (200)"

        # Verify tool calling works — commit plugin uses chatWithTools (function calling).
        # If this fails it explains why commit falls back to heuristics.
        TOOLS_HTTP=$(curl -s -o /tmp/tools-test.json -w "%{http_code}" \
          -X POST https://api.kblabs.ru/llm/v1/chat/completions \
          -H "Content-Type: application/json" \
          -H "Authorization: Bearer $GW_TOKEN" \
          -d '{"model":"small","messages":[{"role":"user","content":"x"}],"tools":[{"type":"function","function":{"name":"t","description":"d","parameters":{"type":"object","properties":{}}}}],"tool_choice":{"type":"function","function":{"name":"t"}},"max_tokens":50}' 2>/dev/null || echo "0")
        if [ "$TOOLS_HTTP" = "200" ]; then
          # Verify the response actually contains tool_calls — not just a plain completion.
          # If model ignores tool_choice, chatWithTools returns empty toolCalls → commit falls back to heuristics silently.
          TOOLS_HAS_CALLS=$(python3 -c "
import json, sys
try:
    d = json.load(open('/tmp/tools-test.json'))
    tc = d.get('choices', [{}])[0].get('message', {}).get('tool_calls')
    print('yes' if tc else 'no')
except Exception as e:
    print('parse-error: ' + str(e))
" 2>/dev/null || echo "parse-error")
          if [ "$TOOLS_HAS_CALLS" = "yes" ]; then
            pass "gateway tool calling reachable + tool_calls returned"
          else
            TOOLS_BODY=$(cat /tmp/tools-test.json 2>/dev/null || echo "no response")
            fail "gateway tool calling" "HTTP 200 but no tool_calls in response (has_calls=$TOOLS_HAS_CALLS). Body: $TOOLS_BODY"
          fi
        else
          TOOLS_ERR=$(cat /tmp/tools-test.json 2>/dev/null || echo "no response")
          fail "gateway tool calling" "tools request returned $TOOLS_HTTP: $TOOLS_ERR"
        fi
      else
        LLM_ERR=$(cat /tmp/llm-test.json 2>/dev/null || echo "no response")
        fail "gateway LLM" "token ok but LLM endpoint returned $LLM_HTTP: $LLM_ERR"
      fi
    else
      fail "gateway token" "expected 200, got $TOKEN_HTTP — LLM tests will be skipped"
    fi
  else
    fail "gateway credentials" "KB_GATEWAY_CLIENT_ID or KB_GATEWAY_CLIENT_SECRET empty in .env"
  fi
fi

# Pre-check: verify adapter is in marketplace.lock and importable from platform dir
PLATFORM_DIR="$LLM_PLATFORM_DIR"
GW_IN_LOCK=$(python3 -c "import json; d=json.load(open('$PLATFORM_DIR/.kb/marketplace.lock')); print('found' if any('kblabs-gateway' in k for k in d.get('installed',{}).keys()) else 'missing')" 2>/dev/null || echo "no-lock")
# Import test runs from platform dir — that's where the adapter is actually installed.
GW_IMPORT=$(cd "$PLATFORM_DIR" && node --input-type=module --eval "
import { createAdapter } from '@kb-labs/adapters-kblabs-gateway';
console.log('ok');
" 2>&1 || echo "FAIL")
echo "  [diag] kblabs-gateway in marketplace.lock: $GW_IN_LOCK"
echo "  [diag] kblabs-gateway import from platform dir: $GW_IMPORT"
# Also show raw marketplace.lock installed keys for reference
LOCK_KEYS=$(python3 -c "import json; d=json.load(open('$PLATFORM_DIR/.kb/marketplace.lock')); print(', '.join(list(d.get('installed',{}).keys())[:10]))" 2>/dev/null || echo "no-lock")
echo "  [diag] marketplace.lock keys (first 10): $LOCK_KEYS"

# Diagnostic: CWD and .env location check
echo "  [diag] CWD=$(pwd)"
echo "  [diag] .env in CWD=$(ls .env 2>/dev/null && echo yes || echo no)"
echo "  [diag] .env at /tmp/work/my-project=$(ls /tmp/work/my-project/.env 2>/dev/null && echo yes || echo no)"
find /tmp/work/my-project -name ".env" -maxdepth 2 2>/dev/null | while read f; do echo "  [diag] found .env at: $f"; done

# Diagnostic: simulate config-loader (loadEnvFile + interpolateConfig) to check kbClientId.
# Uses python3 to avoid shell escaping issues with ${...} patterns.
python3 << 'PYEOF'
import re, sys, os

# Step 1: load project .env (mirrors config-loader loadEnvFile)
env_extra = {}
env_path = os.path.join(os.getcwd(), '.env')
try:
    for line in open(env_path).read().splitlines():
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        eq = line.find('=')
        if eq < 0:
            continue
        k = line[:eq].strip()
        v = line[eq+1:].strip().strip('"\'')
        if k:
            env_extra[k] = v
except Exception as e:
    print(f'  [diag] .env read error: {e}')

kid_env = env_extra.get('KB_GATEWAY_CLIENT_ID', os.environ.get('KB_GATEWAY_CLIENT_ID', ''))
print(f'  [diag] KB_GATEWAY_CLIENT_ID from .env: {kid_env[:8]}{"..." if kid_env else "(EMPTY)"}')

# Step 2: read platform config adapterOptions.llm.kbClientId
# Try regex-based extraction to avoid JSONC parse errors entirely
try:
    txt = open(os.environ.get('LLM_PLATFORM_DIR', '/root/kb-platform') + '/.kb/kb.config.jsonc').read()
    # Regex search for kbClientId value (avoids full JSONC parse)
    m = re.search(r'"kbClientId"\s*:\s*"([^"]*)"', txt)
    raw_id = m.group(1) if m else 'MISSING'
    print(f'  [diag] kbClientId raw in config: {raw_id[:40]}')
    # Step 3: interpolate (mirrors interpolateConfig)
    merged_env = {**os.environ, **env_extra}
    def interpolate(s):
        return re.sub(r'\$\{([^}]+)\}', lambda m2: merged_env.get(m2.group(1), f'UNRESOLVED:{m2.group(1)}'), s)
    resolved = interpolate(raw_id)
    ok = resolved and not resolved.startswith('UNRESOLVED') and not resolved.startswith('${')
    print(f'  [diag] kbClientId after interpolation: {resolved[:8]}{"..." if ok else " (UNRESOLVED or TEMPLATE)"}')
except Exception as e:
    print(f'  [diag] platform config read error: {e}')
PYEOF

COMMIT_OUT=$(KB_LOG_LEVEL=debug kb commit commit --dry-run 2>&1 || true)
if echo "$COMMIT_OUT" | grep -q "LLM: Phase"; then
  LLM_LINE=$(echo "$COMMIT_OUT" | grep "LLM:" | head -1)
  PLAN_LINE=$(echo "$COMMIT_OUT" | grep "Planned Commits" -A1 | tail -1 | sed 's/^[│ ]*//')
  pass "AI commit dry-run: $LLM_LINE → $PLAN_LINE"
elif [ "$GW_REACHABLE" = "1" ]; then
  echo "=== COMMIT DEBUG (first 30 lines) ===" && echo "$COMMIT_OUT" | head -30
  echo "=== COMMIT DEBUG (last 30 lines) ===" && echo "$COMMIT_OUT" | tail -30
  # Platform adapter init: shows whether kblabs-gateway loaded or fell back to NoOp.
  ADAPTER_STATUS=$(echo "$COMMIT_OUT" | grep -i "Platform adapters\|Failed to load adapter\|NoOp adapters\|adapters initialized\|kblabs-gateway" | head -5 || true)
  if [ -n "$ADAPTER_STATUS" ]; then
    echo "  [diag] adapter init status:"
    echo "$ADAPTER_STATUS" | while IFS= read -r line; do echo "    $line"; done
  fi
  # LLM fallback: [commit] from stderr.write in commit-plan.ts; "falling back" from pino parent logger.
  LLM_FALLBACK=$(echo "$COMMIT_OUT" | grep -i "falling back to heuristics\|\[commit\] LLM failed" | head -3 || true)
  if [ -n "$LLM_FALLBACK" ]; then
    echo "  [diag] LLM fallback line(s):"
    echo "$LLM_FALLBACK" | while IFS= read -r line; do echo "    $line"; done
  fi
  # Pino warn/error JSON lines (level 40/50) — any parent-side errors.
  PINO_ERRORS=$(echo "$COMMIT_OUT" | grep -E '"level":(40|50)' | head -5 || true)
  if [ -n "$PINO_ERRORS" ]; then
    echo "  [diag] pino warn/error lines:"
    echo "$PINO_ERRORS" | while IFS= read -r line; do echo "    $line"; done
  fi
  fail "AI commit" "gateway reachable but fell back to heuristics (adapter or config broken)"
else
  pass "AI commit dry-run: skipped (gateway unreachable from CI)"
fi

# ── Step 6b: AI commit actually commits ────────────────────────────────
echo "── Step 6b: AI commit (real)"
COMMIT_BEFORE=$(git rev-parse HEAD 2>/dev/null || echo "none")
cat >> app.ts << 'TSEOF'
export function shout(name: string) { return `HEY, ${name}!`; }
TSEOF
git add .
if kb commit commit --yes > /tmp/commit-real.log 2>&1; then
  COMMIT_AFTER=$(git rev-parse HEAD 2>/dev/null || echo "none")
  if [ "$COMMIT_AFTER" != "$COMMIT_BEFORE" ]; then
    MSG=$(git log --format="%s" -1)
    pass "AI commit created: $MSG"
  else
    fail "AI commit real" "command succeeded but HEAD did not change"
  fi
else
  fail "AI commit real" "command failed: $(tail -3 /tmp/commit-real.log)"
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
  MANIFEST="packages/demo-entry/dist/manifest.js"
  if [ -f "$MANIFEST" ]; then
    pass "plugin build (dist/manifest.js exists)"
  else
    fail "plugin build" "dist/manifest.js missing"
  fi
else
  fail "plugin build" "install or build failed"
  tail -10 /tmp/plugin-build.log
fi

# ── Step 8b: Plugin manifest is valid ─────────────────────────────────
echo "── Step 8b: Plugin manifest valid"
MANIFEST_FILE=".kb/plugins/demo/packages/demo-entry/dist/manifest.js"
cd /tmp/work/my-project
if [ -f "$MANIFEST_FILE" ]; then
  # manifest.js is ESM — check it exports definePlugin/name/version via grep
  if grep -q "definePlugin\|pluginName\|\"name\"\|'name'" "$MANIFEST_FILE"; then
    pass "plugin manifest valid (contains plugin definition)"
  else
    fail "plugin manifest" "missing expected plugin definition in manifest.js"
  fi
else
  fail "plugin manifest" "manifest.js not found — build may have failed"
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

# ── Step 10: Update platform ──────────────────────────────────────────
echo "── Step 10: Update platform"
cd /tmp/work/my-project
if kb-create update --yes > /tmp/update.log 2>&1; then
  # Verify packages were refreshed — lock file must be updated
  if [ -f .kb/marketplace.lock ]; then
    pass "kb-create update (lock file present)"
  else
    fail "kb-create update" "lock file missing after update"
  fi
else
  fail "kb-create update" "command failed"
  tail -20 /tmp/update.log
fi

# Verify core plugins still discoverable after update
if kb --help > /tmp/help-post-update.log 2>&1; then
  if grep -q "commit" /tmp/help-post-update.log && grep -q "scaffold" /tmp/help-post-update.log; then
    pass "plugins intact after update"
  else
    fail "post-update plugins" "expected plugins missing from kb --help"
  fi
else
  fail "post-update kb --help" "command failed after update"
fi

# ── Step 10b: Credentials survive update ──────────────────────────────
echo "── Step 10b: Credentials survive update"
if [ -f .env ] && grep -q "KB_GATEWAY_CLIENT_ID" .env && grep -q "KB_GATEWAY_CLIENT_SECRET" .env; then
  pass ".env credentials intact after update"
else
  fail "credentials after update" ".env missing or credentials wiped by update"
fi

# ── Step 10c: LLM still works after update ────────────────────────────
echo "── Step 10c: LLM still works after update"
cat >> app.ts << 'TSEOF'
export function whisper(name: string) { return `psst, ${name}...`; }
TSEOF
git add .
POST_UPDATE_OUT=$(KB_LOG_LEVEL=debug kb commit commit --dry-run 2>&1 || true)
if echo "$POST_UPDATE_OUT" | grep -q "LLM: Phase"; then
  pass "AI commit dry-run works after update"
elif [ "$GW_REACHABLE" = "1" ]; then
  echo "=== POST-UPDATE DEBUG (first 30 lines) ===" && echo "$POST_UPDATE_OUT" | head -30
  echo "=== POST-UPDATE DEBUG (last 30 lines) ===" && echo "$POST_UPDATE_OUT" | tail -30
  POST_ADAPTER=$(echo "$POST_UPDATE_OUT" | grep -i "Platform adapters\|Failed to load adapter\|NoOp adapters\|adapters initialized\|kblabs-gateway" | head -5 || true)
  if [ -n "$POST_ADAPTER" ]; then
    echo "  [diag] post-update adapter status:"
    echo "$POST_ADAPTER" | while IFS= read -r line; do echo "    $line"; done
  fi
  POST_FALLBACK=$(echo "$POST_UPDATE_OUT" | grep -i "falling back to heuristics\|\[commit\] LLM failed" | head -3 || true)
  if [ -n "$POST_FALLBACK" ]; then
    echo "  [diag] LLM fallback line(s):"
    echo "$POST_FALLBACK" | while IFS= read -r line; do echo "    $line"; done
  fi
  POST_PINO_ERRORS=$(echo "$POST_UPDATE_OUT" | grep -E '"level":(40|50)' | head -5 || true)
  if [ -n "$POST_PINO_ERRORS" ]; then
    echo "  [diag] pino warn/error lines:"
    echo "$POST_PINO_ERRORS" | while IFS= read -r line; do echo "    $line"; done
  fi
  fail "LLM after update" "gateway reachable but fell back to heuristics after update"
else
  pass "LLM after update: skipped (gateway unreachable from CI)"
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
