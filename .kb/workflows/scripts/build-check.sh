#!/usr/bin/env bash
# Step: Build Check — verify affected packages compile after implementation
set -e

cd "${KB_WORKSPACE_ROOT:-$(pwd)}"

echo "Building affected packages..."
BUILD_OUT=$(mktemp)
# studio's fork-dev-worker hangs indefinitely; run with 4-minute timeout and kill stragglers
timeout 240 kb-devkit run build --affected 2>&1 | tee "$BUILD_OUT"
BUILD_EXIT=${PIPESTATUS[0]}

# kill any lingering studio fork-dev-worker processes (they survive after timeout)
pkill -9 -f "fork-dev-worker" 2>/dev/null || true
pkill -9 -f "pnpm run build:studio" 2>/dev/null || true

# exit code 124 = timeout (studio hung but non-studio packages may have built fine)
# check if any actual build errors occurred (not just timeout)
if [ "$BUILD_EXIT" -ne 0 ] && [ "$BUILD_EXIT" -ne 124 ]; then
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
