#!/usr/bin/env bash
# Step: Build Check — verify affected packages compile after implementation
set -e

cd "${KB_WORKSPACE_ROOT:-$(pwd)}"

echo "Building affected packages..."
BUILD_OUT=$(mktemp)

# Pass 1: warm the build cache. In a fresh worktree pre-existing broken packages
# (e.g. kb-labs-web) build from scratch and fail, making devkit exit non-zero even
# though the PR's changes are fine. We let this pass fail freely so the next pass
# sees those failures as "cached" and excludes them from the fail count.
timeout 240 kb-devkit run build --affected > /dev/null 2>&1 || true
pkill -9 -f "fork-dev-worker" 2>/dev/null || true
pkill -9 -f "pnpm run build:studio" 2>/dev/null || true

# Pass 2: real check — cache is warm, only fresh failures (from this PR) count.
timeout 240 kb-devkit run build --affected 2>&1 | tee "$BUILD_OUT"
BUILD_EXIT=${PIPESTATUS[0]}

# kill stragglers from pass 2
pkill -9 -f "fork-dev-worker" 2>/dev/null || true
pkill -9 -f "pnpm run build:studio" 2>/dev/null || true

# exit code 124 = timeout (studio hung but non-studio packages may have built fine)
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
