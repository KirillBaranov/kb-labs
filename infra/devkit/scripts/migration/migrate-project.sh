#!/bin/bash
# migrate-project.sh <project-dir>
# Migrate a single KB Labs project to use workspace external bundling

set -e

PROJECT=$1

if [ -z "$PROJECT" ]; then
  echo "Usage: $0 <project-dir>"
  echo "Example: $0 kb-labs-core"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
PROJECT_DIR="$ROOT_DIR/$PROJECT"

if [ ! -d "$PROJECT_DIR" ]; then
  echo "Error: Project directory not found: $PROJECT_DIR"
  exit 1
fi

cd "$PROJECT_DIR"

echo "=== Migrating $PROJECT ==="
echo ""

# Step 1: Check if project uses tsup
tsup_configs=$(find . -name "tsup.config.ts" -type f 2>/dev/null | wc -l | tr -d ' ')
if [ "$tsup_configs" -eq 0 ]; then
  echo "⚠️  No tsup.config.ts found. Skipping migration."
  exit 0
fi

echo "Found $tsup_configs tsup.config.ts file(s)"
echo ""

# Step 2: Update DevKit
echo "📦 Step 1: Updating DevKit..."
if [ -f "package.json" ] && grep -q "@kb-labs/devkit" package.json; then
  pnpm add -D @kb-labs/devkit@latest || {
    echo "⚠️  Failed to update DevKit. Continuing..."
  }
else
  echo "⚠️  DevKit not found in package.json. Skipping update."
fi
echo ""

# Step 3: Generate tsconfig.build.json
echo "📄 Step 2: Generating tsconfig.build.json..."
if [ -f "scripts/devkit-sync.mjs" ] || [ -f "node_modules/.bin/kb-devkit-sync" ]; then
  pnpm devkit:sync || {
    echo "⚠️  DevKit sync failed. Trying alternative..."
    pnpm exec kb-devkit-sync || {
      echo "❌ Failed to run DevKit sync"
      exit 1
    }
  }

  build_configs=$(find . -name "tsconfig.build.json" -type f 2>/dev/null | wc -l | tr -d ' ')
  echo "✅ Generated $build_configs tsconfig.build.json file(s)"
else
  echo "⚠️  DevKit sync script not found. Skipping tsconfig.build.json generation."
fi
echo ""

# Step 4: Update tsup.config.ts files
echo "⚙️  Step 3: Checking tsup.config.ts files..."
find . -name "tsup.config.ts" -type f | while read -r file; do
  if ! grep -q "tsconfig.*build" "$file"; then
    echo "  ⚠️  Need to update: $file"
    echo "     Add: tsconfig: \"tsconfig.build.json\""
  else
    echo "  ✅ Already configured: $file"
  fi
done
echo ""

# Step 5: Generate tsup.external.json
echo "📋 Step 4: Generating tsup.external.json..."
pnpm install || {
  echo "⚠️  pnpm install failed. Continuing..."
}

if [ -f "tsup.external.json" ]; then
  echo "✅ tsup.external.json exists"
else
  echo "⚠️  tsup.external.json not generated. Run: kb-devkit-tsup-external --generate"
fi
echo ""

# Step 6: Rebuild (dry run check)
echo "🔨 Step 5: Checking build configuration..."
echo "  Run 'pnpm build' to rebuild packages after updating tsup.config.ts files"
echo ""

echo "=== Migration steps completed for $PROJECT ==="
echo ""
echo "⚠️  IMPORTANT: Manual steps required:"
echo "  1. Update all tsup.config.ts files to include: tsconfig: \"tsconfig.build.json\""
echo "  2. Run: pnpm build"
echo "  3. Verify bundle sizes and external imports"
echo "  4. Test runtime functionality"

