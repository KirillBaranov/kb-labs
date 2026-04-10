#!/bin/bash
# update-tsup-configs.sh <project-dir>
# Automatically update all tsup.config.ts files to use tsconfig.build.json

set -e

PROJECT=$1

if [ -z "$PROJECT" ]; then
  echo "Usage: $0 <project-dir>"
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

echo "=== Updating tsup.config.ts files in $PROJECT ==="
echo ""

# Find all tsup.config.ts files
find . -name "tsup.config.ts" -type f | while read -r file; do
  echo "Processing: $file"
  
  # Check if already has tsconfig.build.json
  if grep -q "tsconfig.*build" "$file"; then
    echo "  ✅ Already configured"
    continue
  fi
  
  # Check file content to determine update strategy
  if grep -q "defineConfig" "$file"; then
    # File uses defineConfig - add tsconfig line
    if grep -q "export default defineConfig" "$file"; then
      # Find the line with entry or after nodePreset
      if grep -q "entry:" "$file"; then
        # Add after entry block
        sed -i.bak '/entry:/a\
  tsconfig: "tsconfig.build.json", // Use build-specific tsconfig without paths
' "$file"
        rm -f "${file}.bak"
        echo "  ✅ Updated (added after entry)"
      else
        # Add after nodePreset spread
        sed -i.bak '/\.\.\.nodePreset/a\
  tsconfig: "tsconfig.build.json", // Use build-specific tsconfig without paths
' "$file"
        rm -f "${file}.bak"
        echo "  ✅ Updated (added after nodePreset)"
      fi
    fi
  elif grep -q "export.*default.*from.*devkit" "$file"; then
    # File exports default from devkit - need to convert
    echo "  ⚠️  Needs manual conversion (exports default from devkit)"
  elif grep -q "import.*config.*from.*devkit" "$file"; then
    # File imports config - need to convert
    echo "  ⚠️  Needs manual conversion (imports config)"
  else
    echo "  ⚠️  Unknown format, needs manual review"
  fi
done

echo ""
echo "=== Update complete ==="
echo "⚠️  Please review changes and test builds"

