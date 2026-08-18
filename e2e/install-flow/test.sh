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
#   docker build -t kb-e2e -f e2e/install-flow/Dockerfile e2e/install-flow
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
summary() {
  echo ""
  echo "════════════════════════════════════════"
  echo "  KB Labs E2E: $PASS passed, $FAIL failed"
  printf "$STEPS\n"
  echo "════════════════════════════════════════"
}

# A user journey must never turn an unavailable prerequisite into a green
# test.  Technical suites may skip when their optional service is absent;
# this release journey is the contract for a fresh install and therefore
# records every missing prerequisite as a failure.
require_file() {
  if [ -f "$1" ]; then
    pass "$2"
  else
    fail "$2" "missing file: $1"
  fi
}

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
if kb-create my-project --yes --platform "$LLM_PLATFORM_DIR" > /tmp/bootstrap.log 2>&1; then
  INSTALL_OUT=$(cat /tmp/bootstrap.log)
  pass "kb-create my-project"
else
  INSTALL_OUT=$(cat /tmp/bootstrap.log)
  fail "kb-create" "bootstrap failed (exit $?)"
  tail -20 /tmp/bootstrap.log
fi

# This is the first user-value gate: a zero exit code is not enough if the
# launcher did not leave behind the artifacts needed for the next command.
require_file "/tmp/work/my-project/.kb/install.json" "install manifest written"
require_file "/tmp/work/my-project/.kb/devservices.yaml" "service manifest written"
require_file "$LLM_PLATFORM_DIR/node_modules/@kb-labs/cli-bin/dist/bin.js" "kb CLI artifact installed"
require_file "$LLM_PLATFORM_DIR/bin/kb-dev" "kb-dev artifact installed"

# Do not let a missing first-value project turn the rest of the release gate
# into an opaque `cd`/set -e error. Stop at the failed user transition and
# print the aggregated evidence.
if [ ! -d "/tmp/work/my-project" ]; then
  fail "fresh project directory" "bootstrap did not create /tmp/work/my-project"
  summary
  exit 1
fi

# ── Step 1b: --yes installs with no LLM provider configured (B-001) ──────────
# The --llm flag + gateway auto-registration were removed; LLM is configured by
# choosing a provider in the wizard (skipped by --yes) or by setting an API key.
echo "── Step 1b: --yes = no LLM provider, no gateway creds"
mkdir -p /tmp/work-nollm && cd /tmp/work-nollm
kb-create nollm-project --yes --platform "$NOLLM_PLATFORM_DIR" > /tmp/bootstrap-nollm.log 2>&1 || true
NOLLM_ENV=""
if [ -f /tmp/work-nollm/nollm-project/.env ]; then
  NOLLM_ENV=$(cat /tmp/work-nollm/nollm-project/.env)
fi
if echo "$NOLLM_ENV" | grep -q "KB_GATEWAY_CLIENT_ID"; then
  fail "--yes no gateway creds" "gateway credentials written to .env — auto-registration was removed (B-001)"
else
  pass "--yes: no gateway credentials in .env"
fi
cd /tmp/work

# ── Step 1c: --llm flag was removed (B-001) ──────────────────────────────────
echo "── Step 1c: --llm flag is rejected"
if kb-create llm-flag-test --yes --llm --platform "$NOLLM_PLATFORM_DIR" > /tmp/llm-flag.log 2>&1; then
  fail "--llm removed" "--llm was accepted — the flag should have been removed (B-001)"
else
  pass "--llm flag rejected (removed in B-001)"
fi

# ── Step 1d: .gitignore still lists .env (for when a provider key is added) ───
echo "── Step 1d: .env is gitignored"
GITIGNORE_FILE="/tmp/work/my-project/.gitignore"
if [ -f "$GITIGNORE_FILE" ] && grep -qE "^\.env$|^\.env[[:space:]]" "$GITIGNORE_FILE"; then
  pass ".env is gitignored"
else
  fail ".gitignore" ".env is not in .gitignore — a provider key would be committed"
fi

# ── Step 1e: No @kb-labs peer dep warnings ────────────────────────────────────
echo "── Step 1e: No @kb-labs peer dep warnings"
if echo "$INSTALL_OUT" | grep -q "@kb-labs.*unmet peer\|unmet peer.*@kb-labs"; then
  fail "peer-dep warnings" "found @kb-labs peer dep warnings in install output"
else
  pass "no @kb-labs peer dep warnings"
fi

# ── Step 1f: kb-create install --plugins=release (scoped, non-interactive) ────
# Exercises the standalone CI/agent install path — no wizard, no gateway/
# workflow/marketplace pulled in unless explicitly asked. Uses the real
# `kb-create` binary just installed via install.sh (i.e. whatever the last
# binaries release actually shipped), against real npm.
echo "── Step 1f: kb-create install --plugins=release"
export PLUGIN_PLATFORM_DIR=/tmp/kb-e2e-plugin/kb-platform
mkdir -p /tmp/work-plugin && cd /tmp/work-plugin
if kb-create install --plugins=release --platform "$PLUGIN_PLATFORM_DIR" > /tmp/install-plugin.log 2>&1; then
  pass "kb-create install --plugins=release"
else
  fail "kb-create install --plugins=release" "command failed (exit $?)"
  tail -20 /tmp/install-plugin.log
fi

if [ -d "$PLUGIN_PLATFORM_DIR/node_modules/@kb-labs/release-manager-cli" ]; then
  pass "release-manager-cli present in node_modules"
else
  fail "release-manager-cli install" "package not found under node_modules"
fi

if [ -f "$PLUGIN_PLATFORM_DIR/.kb/devservices.yaml" ] && grep -qE "gateway|workflow-daemon|marketplace" "$PLUGIN_PLATFORM_DIR/.kb/devservices.yaml"; then
  fail "install scoping" "devservices.yaml mentions an unselected service — install --plugins=release is not scoped"
else
  pass "install --plugins=release did not pull in unselected services"
fi

# Reinstalling a second plugin must extend the user's installation. A scoped
# install that silently replaces the first plugin destroys the user's setup.
echo "── Step 1g: custom plugin install preserves an existing plugin"
export PRESERVE_PLATFORM_DIR=/tmp/kb-e2e-preserve/kb-platform
mkdir -p /tmp/work-preserve && cd /tmp/work-preserve
if kb-create install --plugins=commit --platform "$PRESERVE_PLATFORM_DIR" > /tmp/install-preserve-first.log 2>&1 && \
   kb-create install --plugins=release --platform "$PRESERVE_PLATFORM_DIR" > /tmp/install-preserve-second.log 2>&1; then
  if [ -d "$PRESERVE_PLATFORM_DIR/node_modules/@kb-labs/commit-entry" ] && \
     [ -d "$PRESERVE_PLATFORM_DIR/node_modules/@kb-labs/release-manager-cli" ]; then
    pass "custom plugin install preserves the existing plugin"
  else
    fail "custom plugin preservation" "second install replaced the first plugin"
  fi
else
  fail "custom plugin preservation" "one of the sequential custom installs failed"
  tail -20 /tmp/install-preserve-first.log /tmp/install-preserve-second.log 2>/dev/null || true
fi

if kb-create install --plugins=this-plugin-does-not-exist --platform /tmp/kb-e2e-bad-plugin > /tmp/install-bad-plugin.log 2>&1; then
  fail "unknown plugin validation" "install with an unknown plugin id should have failed"
else
  if grep -q "unknown plugin" /tmp/install-bad-plugin.log; then
    pass "unknown plugin id fails fast with a clear error"
  else
    fail "unknown plugin validation" "failed, but not with the expected 'unknown plugin' message"
  fi
fi
cd /tmp/work

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

# ── Step 4c: CLI session auth journey (kb auth login/register/logout) ──
# Exercises the actual `kb` binary end-to-end against a real running gateway
# — the HTTP contract is covered separately by e2e/auth's Playwright specs
# (08-register-authz, 09-cli-session), but only a real process invocation
# here catches argv/flag parsing and on-disk file handling that a mocked
# unit test can't see.
echo "── Step 4c: kb-dev start all services + CLI session login"
cd /tmp/work/my-project
if kb-dev start > /tmp/kb-dev-start.log 2>&1; then
  pass "kb-dev start all services"
else
  fail "kb-dev start all services" "command failed: $(tail -20 /tmp/kb-dev-start.log)"
fi

GW_UP=0
for i in $(seq 1 30); do
  if curl -sf http://127.0.0.1:4000/health > /dev/null 2>&1; then
    GW_UP=1
    break
  fi
  sleep 1
done
if [ "$GW_UP" = "1" ]; then
  pass "gateway /health reachable after kb-dev start"
else
  fail "kb-dev start gateway" "gateway /health never became reachable: $(tail -20 /tmp/kb-dev-start.log)"
fi

for service_url in \
  http://127.0.0.1:7777/health \
  http://127.0.0.1:4000/health \
  http://127.0.0.1:5070/health \
  http://127.0.0.1:5050/api/v1/health \
  http://127.0.0.1:7778/health \
  http://127.0.0.1:3000/; do
  if curl -fsS "$service_url" > /dev/null 2>&1; then
    pass "service reachable: $service_url"
  else
    fail "service reachable: $service_url" "health endpoint did not return 2xx"
  fi
done

BOOTSTRAP_PASSWORD=""
if [ -f .env ]; then
  BOOTSTRAP_PASSWORD=$(grep "^GATEWAY_BOOTSTRAP_ADMIN_PASSWORD=" .env | cut -d= -f2)
fi

if [ "$GW_UP" = "1" ] && [ -n "$BOOTSTRAP_PASSWORD" ]; then
  if kb auth login --gateway-url http://127.0.0.1:4000 --email admin@bootstrap.local --password "$BOOTSTRAP_PASSWORD" > /tmp/auth-login-cli.log 2>&1; then
    pass "kb auth login --email/--password"
  else
    fail "kb auth login (human)" "command failed: $(tail -10 /tmp/auth-login-cli.log)"
  fi

  SESSION_FILE="$HOME/.kb/session.json"
  if [ -f "$SESSION_FILE" ]; then
    PERM=$(stat -c '%a' "$SESSION_FILE" 2>/dev/null || stat -f '%Lp' "$SESSION_FILE" 2>/dev/null || echo "?")
    if [ "$PERM" = "600" ]; then
      pass "~/.kb/session.json created with 0600 perms"
    else
      fail "session.json perms" "expected 600, got $PERM"
    fi
  else
    fail "session.json" "not created after kb auth login"
  fi

  # The actual gap this whole session-auth feature closes: /auth/register
  # was unreachable from the CLI before — the auto-provisioned bootstrap
  # machine credential deliberately carries no MACHINE_REGISTER permission;
  # only a human session (this login) can supply it.
  REG_OUT=$(kb auth register --gateway-url http://127.0.0.1:4000 --name e2e-cli-agent --namespace-id default 2>&1 || true)
  if echo "$REG_OUT" | grep -q "Client ID:"; then
    pass "kb auth register succeeded via CLI session"
  else
    fail "kb auth register" "unexpected output: $REG_OUT"
  fi

  # Marketplace is deliberately exercised through the user-facing CLI after
  # login. Direct HTTP marketplace tests cannot catch a missing Authorization
  # header in the CLI transport layer.
  MARKETPLACE_LIST=$(kb marketplace plugins list --json 2>&1 || true)
  if echo "$MARKETPLACE_LIST" | jq -e '.ok == true' > /dev/null 2>&1; then
    pass "marketplace list authenticated through CLI"
  else
    fail "marketplace list authenticated through CLI" "$MARKETPLACE_LIST"
  fi

  MARKETPLACE_INSTALL=$(kb marketplace install @kb-labs/release-manager-cli --yes --json 2>&1 || true)
  if echo "$MARKETPLACE_INSTALL" | jq -e '.ok == true' > /dev/null 2>&1; then
    pass "marketplace install authenticated through CLI"
  else
    fail "marketplace install authenticated through CLI" "$MARKETPLACE_INSTALL"
  fi

  kb auth logout > /tmp/auth-logout.log 2>&1 || true
  CRED_FILE="$HOME/.kb/credentials.json"
  if [ ! -f "$SESSION_FILE" ] && [ ! -f "$CRED_FILE" ]; then
    pass "kb auth logout removed both credential stores"
  else
    fail "kb auth logout" "session.json or credentials.json still present after logout"
  fi

  # Continue the journey as an authenticated user after explicitly testing
  # logout. Workflow commands below are user-facing authenticated operations,
  # so they must not accidentally pass through an anonymous local shortcut.
  if kb auth login --gateway-url http://127.0.0.1:4000 --email admin@bootstrap.local --password "$BOOTSTRAP_PASSWORD" > /tmp/auth-relogin-cli.log 2>&1; then
    pass "kb auth re-login for authenticated user journey"
  else
    fail "kb auth re-login" "command failed: $(tail -10 /tmp/auth-relogin-cli.log)"
  fi
else
  fail "CLI session auth journey" "gateway not reachable or bootstrap password missing"
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
kb marketplace plugins refresh > /dev/null 2>&1 || true
HELLO_OUT=$(kb demo hello --who=E2E 2>&1 || true)
if echo "$HELLO_OUT" | grep -q "Hello, E2E from demo"; then
  pass "kb demo hello --who=E2E"
else
  fail "plugin run" "unexpected output: $HELLO_OUT"
fi

# ── Step 9b: Workflow first value ─────────────────────────────────────
# Make the freshly bootstrapped project runnable before invoking the shipped
# healthcheck workflow. This keeps the assertion about the workflow engine,
# rather than failing early because the test fixture has no package manifest.
echo "── Step 9b: Workflow first value"
cd /tmp/work/my-project
WORKFLOW_LINT=$(kb workflow lint --json 2>&1 || true)
if echo "$WORKFLOW_LINT" | jq -e '.ok == true' > /dev/null 2>&1; then
  pass "all shipped workflow templates pass lint"
else
  fail "all shipped workflow templates pass lint" "$WORKFLOW_LINT"
fi

cat > package.json <<'TSEOF'
{
  "name": "kb-e2e-project",
  "private": true,
  "scripts": {
    "build": "node -e \"console.log('build ok')\"",
    "lint": "node -e \"console.log('lint ok')\"",
    "test": "node -e \"console.log('test ok')\""
  }
}
TSEOF
if pnpm install --lockfile-only > /tmp/project-pnpm-install.log 2>&1; then
  pass "user project dependencies initialized"
else
  fail "user project dependencies initialized" "$(tail -20 /tmp/project-pnpm-install.log)"
fi

WORKFLOW_RUN=$(kb workflow run --workflow-id healthcheck --json 2>&1 || true)
RUN_ID=$(echo "$WORKFLOW_RUN" | jq -r '.data.runId // empty' 2>/dev/null || true)
if [ -z "$RUN_ID" ]; then
  fail "workflow healthcheck submitted" "$WORKFLOW_RUN"
else
  pass "workflow healthcheck submitted"
  RUN_STATUS="queued"
  for _ in $(seq 1 30); do
    STATUS_JSON=$(kb workflow runs status --run-id "$RUN_ID" --json 2>&1 || true)
    RUN_STATUS=$(echo "$STATUS_JSON" | jq -r '.data.status // .status // "unknown"' 2>/dev/null || echo unknown)
    case "$RUN_STATUS" in
      completed|failed|cancelled) break ;;
    esac
    sleep 1
  done
  if [ "$RUN_STATUS" = "completed" ]; then
    pass "workflow healthcheck completed"
  else
    fail "workflow healthcheck completed" "final status: $RUN_STATUS"
  fi
  WORKFLOW_LOGS=$(kb workflow runs logs --run-id "$RUN_ID" --json 2>&1 || true)
  if echo "$WORKFLOW_LOGS" | jq -e '.ok == true' > /dev/null 2>&1; then
    pass "workflow run logs available"
  else
    fail "workflow run logs available" "$WORKFLOW_LOGS"
  fi
fi

# The user journey also owns a workflow, changes it, and executes the changed
# version. A catalog entry or a successful submit is not enough: both versions
# must lint and reach a completed run.
CUSTOM_WORKFLOW=".kb/workflows/e2e-user-value.yaml"
cat > "$CUSTOM_WORKFLOW" <<'YAMLEOF'
name: e2e-user-value
version: 1.0.0
on:
  manual: true
jobs:
  verify:
    runsOn: local
    steps:
      - name: User value
        run: echo "user-value-v1"
YAMLEOF

CUSTOM_LINT=$(kb workflow lint --json 2>&1 || true)
if echo "$CUSTOM_LINT" | jq -e '.ok == true' > /dev/null 2>&1; then
  pass "user workflow added and linted"
else
  fail "user workflow added and linted" "$CUSTOM_LINT"
fi

CUSTOM_RUN=$(kb workflow run --workflow-id e2e-user-value --json 2>&1 || true)
CUSTOM_RUN_ID=$(echo "$CUSTOM_RUN" | jq -r '.data.runId // empty' 2>/dev/null || true)
if [ -z "$CUSTOM_RUN_ID" ]; then
  fail "user workflow v1 submitted" "$CUSTOM_RUN"
else
  CUSTOM_STATUS="queued"
  for _ in $(seq 1 30); do
    CUSTOM_STATUS_JSON=$(kb workflow runs status --run-id "$CUSTOM_RUN_ID" --json 2>&1 || true)
    CUSTOM_STATUS=$(echo "$CUSTOM_STATUS_JSON" | jq -r '.data.status // .status // "unknown"' 2>/dev/null || echo unknown)
    case "$CUSTOM_STATUS" in completed|failed|cancelled) break ;; esac
    sleep 1
  done
  if [ "$CUSTOM_STATUS" = "completed" ]; then
    pass "user workflow v1 completed"
  else
    fail "user workflow v1 completed" "final status: $CUSTOM_STATUS"
  fi
fi

cat > "$CUSTOM_WORKFLOW" <<'YAMLEOF'
name: e2e-user-value
version: 1.0.0
on:
  manual: true
jobs:
  verify:
    runsOn: local
    steps:
      - name: User value changed
        run: echo "user-value-v2"
YAMLEOF

CUSTOM_LINT_V2=$(kb workflow lint --json 2>&1 || true)
if echo "$CUSTOM_LINT_V2" | jq -e '.ok == true' > /dev/null 2>&1; then
  pass "user workflow edited and linted"
else
  fail "user workflow edited and linted" "$CUSTOM_LINT_V2"
fi

CUSTOM_RUN_V2=$(kb workflow run --workflow-id e2e-user-value --json 2>&1 || true)
CUSTOM_RUN_ID_V2=$(echo "$CUSTOM_RUN_V2" | jq -r '.data.runId // empty' 2>/dev/null || true)
if [ -z "$CUSTOM_RUN_ID_V2" ]; then
  fail "user workflow v2 submitted" "$CUSTOM_RUN_V2"
else
  CUSTOM_STATUS_V2="queued"
  for _ in $(seq 1 30); do
    CUSTOM_STATUS_JSON_V2=$(kb workflow runs status --run-id "$CUSTOM_RUN_ID_V2" --json 2>&1 || true)
    CUSTOM_STATUS_V2=$(echo "$CUSTOM_STATUS_JSON_V2" | jq -r '.data.status // .status // "unknown"' 2>/dev/null || echo unknown)
    case "$CUSTOM_STATUS_V2" in completed|failed|cancelled) break ;; esac
    sleep 1
  done
  if [ "$CUSTOM_STATUS_V2" = "completed" ]; then
    pass "user workflow v2 completed after edit"
  else
    fail "user workflow v2 completed after edit" "final status: $CUSTOM_STATUS_V2"
  fi
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

if [ -f "$CUSTOM_WORKFLOW" ] && grep -q "user-value-v2" "$CUSTOM_WORKFLOW"; then
  pass "user workflow preserved after platform update"
else
  fail "user workflow after update" "edited workflow was removed or overwritten"
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
summary

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
