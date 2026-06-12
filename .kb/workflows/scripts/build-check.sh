#!/usr/bin/env bash
# Step: Build Check — verify affected packages compile after implementation
set -e

cd "${KB_WORKSPACE_ROOT:-$(pwd)}"

echo "Building affected packages..."
if ! kb-devkit run build --affected 2>&1; then
  # Post failure to PR if possible
  if [ -n "$PR_NUMBER" ] && [ -n "$OWNER" ] && [ -n "$REPO" ]; then
    gh pr comment "$PR_NUMBER" --repo "$OWNER/$REPO" \
      --body "## ❌ Build Check Failed

The implementation does not compile. Agent will need to fix build errors before proceeding.

\`\`\`
$(kb-devkit run build --affected 2>&1 | tail -40)
\`\`\`" 2>/dev/null || true
  fi
  exit 1
fi

echo "Build passed."
echo "::kb-output::{\"buildPassed\":true}"
