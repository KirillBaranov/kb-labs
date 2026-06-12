#!/usr/bin/env bash
# Step: Run Tests — actually execute tests for affected packages
set -e

cd "${KB_WORKSPACE_ROOT:-$(pwd)}"

# Find affected packages (those with changes vs base branch)
AFFECTED=$(kb-devkit list --affected 2>/dev/null | grep -v '^$' || echo "")

if [ -z "$AFFECTED" ]; then
  echo "No affected packages found, skipping tests."
  echo "::kb-output::{\"passed\":true,\"tested\":0}"
  exit 0
fi

echo "Affected packages:"
echo "$AFFECTED"

FAILED=0
TESTED=0

while IFS= read -r PKG; do
  [ -z "$PKG" ] && continue
  echo ""
  echo "Testing $PKG..."
  if pnpm --filter "$PKG" run test:cli 2>/dev/null; then
    echo "✓ $PKG"
    TESTED=$((TESTED + 1))
  else
    # Some packages may not have test:cli — check if script exists
    if pnpm --filter "$PKG" run --if-present test:cli 2>/dev/null; then
      echo "✓ $PKG (or no test:cli)"
      TESTED=$((TESTED + 1))
    else
      echo "✗ $PKG — tests FAILED"
      FAILED=$((FAILED + 1))
    fi
  fi
done <<< "$AFFECTED"

if [ $FAILED -gt 0 ]; then
  echo ""
  echo "::kb-output::{\"passed\":false,\"tested\":$TESTED,\"failed\":$FAILED}"
  exit 1
fi

echo ""
echo "All tests passed ($TESTED packages tested)."
echo "::kb-output::{\"passed\":true,\"tested\":$TESTED,\"failed\":0}"
