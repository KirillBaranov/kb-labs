#!/bin/bash
# verify-builds.sh
# Verify builds across all migrated projects

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"

cd "$ROOT_DIR"

echo "=== KB Labs Build Verification ==="
echo ""

PROJECTS=(
  "kb-labs-core"
  "kb-labs-shared"
  "kb-labs-cli"
  "kb-labs-devlink"
  "kb-labs-release-manager"
  "kb-labs-setup-engine"
  "kb-labs-ai-docs"
  "kb-labs-ai-review"
  "kb-labs-ai-tests"
  "kb-labs-analytics"
  "kb-labs-audit"
  "kb-labs-knowledge"
  "kb-labs-mind"
  "kb-labs-plugin"
  "kb-labs-rest-api"
  "kb-labs-studio"
  "kb-labs-workflow"
)

SUCCESS=0
FAILED=0
SKIPPED=0

for PROJECT in "${PROJECTS[@]}"; do
  if [ ! -d "$PROJECT" ]; then
    echo "⚠️  Skipping $PROJECT (not found)"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi
  
  echo "=== Building $PROJECT ==="
  cd "$PROJECT"
  
  # Check if project has build script
  if ! grep -q '"build"' package.json 2>/dev/null; then
    echo "  ⚪ No build script found, skipping"
    SKIPPED=$((SKIPPED + 1))
    cd "$ROOT_DIR"
    continue
  fi
  
  # Try to build
  if pnpm build > /tmp/build-${PROJECT}.log 2>&1; then
    echo "  ✅ Build successful"
    SUCCESS=$((SUCCESS + 1))
    
    # Check for workspace imports in dist files
    workspace_imports=$(find . -path "*/dist/*.js" -type f -exec grep -h "import.*@kb-labs" {} \; 2>/dev/null | wc -l | tr -d ' ')
    if [ "$workspace_imports" -gt 0 ]; then
      echo "  ✅ Workspace packages externalized ($workspace_imports imports found)"
    else
      echo "  ⚠️  No workspace imports found (might be bundled)"
    fi
  else
    echo "  ❌ Build failed"
    echo "  Check /tmp/build-${PROJECT}.log for details"
    FAILED=$((FAILED + 1))
  fi
  
  cd "$ROOT_DIR"
  echo ""
done

echo "=== Summary ==="
echo "✅ Successful: $SUCCESS"
echo "❌ Failed: $FAILED"
echo "⚪ Skipped: $SKIPPED"
echo ""

if [ "$FAILED" -gt 0 ]; then
  echo "⚠️  Some builds failed. Check logs above."
  exit 1
else
  echo "🎉 All builds successful!"
  exit 0
fi


