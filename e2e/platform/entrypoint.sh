#!/bin/sh
set -e

export PATH="$HOME/.local/bin:$PATH"

# ── Step 1: Install KB Labs ────────────────────────────────────────────────
echo "==> [1/3] Installing KB Labs..."
curl -fsSL https://kblabs.ru/install.sh | sh
export PATH="$HOME/.local/bin:$PATH"

if ! command -v kb-create > /dev/null 2>&1; then
  echo "ERROR: kb-create not found after install"
  exit 1
fi
echo "    kb-create $(kb-create --version 2>&1 | head -1)"

# ── Step 2: Bootstrap project ──────────────────────────────────────────────
echo "==> [2/3] Bootstrapping project..."
mkdir -p /workspace && cd /workspace
kb-create kb-e2e --yes
cd kb-e2e

# Scaffold test workflows used by E2E suite
mkdir -p .kb/workflows

cat > .kb/workflows/e2e-hello.yml << 'EOF'
name: e2e-hello
version: 1.0.0
description: E2E smoke workflow — runs echo and exits cleanly
on:
  manual: true
jobs:
  greet:
    runsOn: local
    steps:
      - name: Say hello
        uses: builtin:shell
        with:
          command: echo "hello from e2e"
EOF

cat > .kb/workflows/e2e-fail.yml << 'EOF'
name: e2e-fail
version: 1.0.0
description: E2E failure workflow — intentionally exits non-zero
on:
  manual: true
jobs:
  fail:
    runsOn: local
    steps:
      - name: Fail intentionally
        uses: builtin:shell
        with:
          command: exit 1
EOF

# ── Step 3: Start backend services ────────────────────────────────────────
# Start infra first (state-daemon), then backend group.
# kb-dev start accepts one service/group name — not multiple.
# Redis is optional (in-memory fallback); qdrant skipped (mind/RAG only, not needed for e2e).
echo "==> [3/3] Starting services..."
# state-daemon binds to KB_STATE_DAEMON_HOST — override to 0.0.0.0 so it's
# reachable from the tests container via Docker bridge network.
export KB_STATE_DAEMON_HOST=0.0.0.0
kb-dev start state-daemon &
sleep 3
kb-dev start backend &

echo "==> Waiting for gateway process to start (/health)..."
ATTEMPTS=0
until curl -sf http://localhost:4000/health > /dev/null 2>&1; do
  ATTEMPTS=$((ATTEMPTS + 1))
  if [ "$ATTEMPTS" -ge 90 ]; then
    echo "ERROR: Gateway did not start after 180s"
    kb-dev status || true
    exit 1
  fi
  sleep 2
done
echo "    Gateway process up after ${ATTEMPTS}x2s"

# Wait for all upstreams to be wired (/ready returns 200 only when REST API,
# workflow daemon, marketplace etc. are all responding).
# Docker Compose healthcheck also polls /ready — we must be ready before tail.
echo "==> Waiting for all services to be ready (/ready)..."
ATTEMPTS=0
until curl -sf http://localhost:4000/ready > /dev/null 2>&1; do
  ATTEMPTS=$((ATTEMPTS + 1))
  if [ "$ATTEMPTS" -ge 60 ]; then
    echo "ERROR: Platform /ready did not pass after 120s — upstreams still down"
    kb-dev status || true
    curl -s http://localhost:4000/ready || true
    exit 1
  fi
  sleep 2
done

echo "==> Platform fully ready after ${ATTEMPTS}x2s"
kb-dev status

# Keep container alive while tests run
exec tail -f /dev/null
