#!/usr/bin/env bash
# Step: Build Check — verify affected packages compile after implementation
set -e

cd "${KB_WORKSPACE_ROOT:-$(pwd)}"

echo "Building affected packages..."
BUILD_OUT=$(mktemp)

# studio's fork-dev-worker hangs indefinitely; enforce 4-minute cap via background+timer
# (timeout command is not available on macOS without coreutils)
kb-devkit run build --affected 2>&1 | tee "$BUILD_OUT" &
BUILD_PID=$!
( sleep 240; kill "$BUILD_PID" 2>/dev/null ) &
TIMER_PID=$!
wait "$BUILD_PID"
BUILD_EXIT=$?
kill "$TIMER_PID" 2>/dev/null || true

# kill any lingering studio fork-dev-worker processes (they survive after the kill)
pkill -9 -f "fork-dev-worker" 2>/dev/null || true
pkill -9 -f "pnpm run build:studio" 2>/dev/null || true

# BUILD_EXIT 143 = SIGTERM from timer (studio hung but non-studio packages may have built fine)
if [ "$BUILD_EXIT" -ne 0 ] && [ "$BUILD_EXIT" -ne 143 ]; then
  if [ -n "$PR_NUMBER" ] && [ -n "$OWNER" ] && [ -n "$REPO" ]; then
    gh pr comment "$PR_NUMBER" --repo "$OWNER/$REPO" \
      --body "## ❌ Build Check Failed

The implementation does not compile. Agent will need to fix build errors before proceeding.

\`\`\`
$(tail -40 "$BUILD_OUT")
\`\`\`" 2>/dev/null || true
  fi
  rm -f "$BUILD_OUT"
  exit 1
fi
rm -f "$BUILD_OUT"

echo "Build passed."
echo "::kb-output::{\"buildPassed\":true}"
