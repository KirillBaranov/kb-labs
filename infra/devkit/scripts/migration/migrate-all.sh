#!/bin/bash
# migrate-all.sh
# Mass migration script for all KB Labs projects
# This script updates tsup.config.ts files and generates tsup.external.json

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"

cd "$ROOT_DIR"

echo "=== KB Labs Mass Migration ==="
echo ""

# List of projects to migrate (excluding already migrated)
PROJECTS=(
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
  "kb-labs-ui"
  "kb-labs-plugin-template"
  "kb-labs-product-template"
)

for PROJECT in "${PROJECTS[@]}"; do
  if [ ! -d "$PROJECT" ]; then
    echo "⚠️  Skipping $PROJECT (not found)"
    continue
  fi
  
  echo "=== Processing $PROJECT ==="
  cd "$PROJECT"
  
  # Check if project has tsup.config.ts
  tsup_count=$(find . -name "tsup.config.ts" -type f 2>/dev/null | wc -l | tr -d ' ')
  if [ "$tsup_count" -eq 0 ]; then
    echo "  ⚪ No tsup.config.ts found, skipping"
    cd "$ROOT_DIR"
    continue
  fi
  
  echo "  Found $tsup_count tsup.config.ts file(s)"
  
  # Generate tsup.external.json
  echo "  Generating tsup.external.json..."
  if [ -f "../kb-labs-devkit/bin/devkit-tsup-external.mjs" ]; then
    node ../kb-labs-devkit/bin/devkit-tsup-external.mjs --generate 2>&1 | grep -E "(wrote|error)" || true
  elif [ -f "node_modules/.bin/kb-devkit-tsup-external" ]; then
    pnpm exec kb-devkit-tsup-external --generate 2>&1 | grep -E "(wrote|error)" || true
  else
    echo "  ⚠️  kb-devkit-tsup-external not found"
  fi
  
  # Count files that need updating
  needs_update=$(find . -name "tsup.config.ts" -type f -exec grep -L "tsconfig.*build" {} \; 2>/dev/null | wc -l | tr -d ' ')
  echo "  Files needing update: $needs_update"
  
  if [ "$needs_update" -gt 0 ]; then
    echo "  ⚠️  Manual update required for tsup.config.ts files"
    echo "     Run: find packages -name 'tsup.config.ts' -exec sed -i '' 's/...nodePreset/...nodePreset\\n  tsconfig: \"tsconfig.build.json\",/' {} \\;"
  else
    echo "  ✅ All tsup.config.ts files already configured"
  fi
  
  cd "$ROOT_DIR"
  echo ""
done

echo "=== Migration Summary ==="
echo "Run check-status.sh to see current migration status"

