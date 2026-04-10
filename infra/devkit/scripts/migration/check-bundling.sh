#!/bin/bash
# check-bundling.sh <project-dir> [package-name]
# Check if workspace packages are correctly externalized (not bundled)

set -e

PROJECT=$1
PACKAGE=${2:-""}

if [ -z "$PROJECT" ]; then
  echo "Usage: $0 <project-dir> [package-name]"
  echo "Example: $0 kb-labs-cli packages/cli"
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

if [ -n "$PACKAGE" ]; then
  PACKAGE_DIR="$PROJECT_DIR/$PACKAGE"
  if [ ! -d "$PACKAGE_DIR" ]; then
    echo "Error: Package directory not found: $PACKAGE_DIR"
    exit 1
  fi
  cd "$PACKAGE_DIR"
fi

echo "=== Checking bundling for ${PROJECT}${PACKAGE:+/$PACKAGE} ==="
echo ""

# Find all dist JS files
dist_files=$(find . -path "*/dist/*.js" -type f -not -path "*/node_modules/*" 2>/dev/null)

if [ -z "$dist_files" ]; then
  echo "⚠️  No dist/*.js files found. Run 'pnpm build' first."
  exit 1
fi

echo "Found $(echo "$dist_files" | wc -l | tr -d ' ') dist file(s)"
echo ""

# Check for workspace imports
workspace_imports=$(echo "$dist_files" | xargs grep -h "import.*@kb-labs" 2>/dev/null | wc -l | tr -d ' ')

if [ "$workspace_imports" -eq 0 ]; then
  echo "⚠️  No workspace imports found in dist files"
  echo "   This might indicate that workspace packages are bundled."
  echo "   Check bundle sizes to verify."
else
  echo "✅ Found $workspace_imports workspace import(s)"
  echo "   Workspace packages are correctly externalized"
  echo ""
  echo "Sample imports:"
  echo "$dist_files" | xargs grep -h "import.*@kb-labs" 2>/dev/null | head -5 | sed 's/^/   /'
fi

echo ""

# Check bundle sizes
echo "Bundle sizes:"
for file in $dist_files; do
  size=$(du -h "$file" | cut -f1)
  lines=$(wc -l < "$file" | tr -d ' ')
  echo "  $file: $size ($lines lines)"
done

echo ""

# Check for suspiciously large bundles (>500KB might indicate bundling)
large_bundles=$(echo "$dist_files" | xargs du -k | awk '$1 > 500 {print $2}')
if [ -n "$large_bundles" ]; then
  echo "⚠️  Large bundle(s) detected (>500KB):"
  echo "$large_bundles" | sed 's/^/   /'
  echo "   These might contain bundled workspace packages."
else
  echo "✅ All bundles are reasonably sized"
fi


