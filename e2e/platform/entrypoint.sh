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

# ── Step 3: Start backend services ────────────────────────────────────────
# Skip: qdrant (mind/RAG only), redis (optional), studio/kb-web/kb-docs (UI)
# state-daemon is InMemoryStateBroker — no Redis needed
echo "==> [3/3] Starting services..."
kb-dev start state-daemon workflow rest marketplace gateway &

echo "==> Waiting for gateway to be ready..."
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

echo "==> Platform ready (gateway up after ${ATTEMPTS}x2s)"
kb-dev status

# Keep container alive, forward service logs
exec kb-dev logs
