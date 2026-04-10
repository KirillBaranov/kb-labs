#!/bin/bash
# build-all-with-dts-disabled.sh
# Build all packages with DTS disabled to get JS builds working first

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"

cd "$ROOT_DIR"

echo "=== Building All Packages (DTS Disabled) ==="
echo ""

# Find all packages with tsup.config.ts
packages=$(find . -name "tsup.config.ts" -type f -not -path "*/node_modules/*" -not -path "*/.ignored*" -not -path "*/fixtures/*" | while read -r file; do
  dirname "$file"
done | sort)

TOTAL=$(echo "$packages" | wc -l | tr -d ' ')
SUCCESS=0
FAILED=0
SKIPPED=0
CURRENT=0

for PACKAGE_DIR in $packages; do
  CURRENT=$((CURRENT + 1))
  PACKAGE_NAME=$(basename "$PACKAGE_DIR")
  RELATIVE_PATH=$(echo "$PACKAGE_DIR" | sed "s|^\./||")
  
  echo "[$CURRENT/$TOTAL] 📦 $RELATIVE_PATH"
  
  cd "$PACKAGE_DIR"
  
  if [ ! -f "package.json" ]; then
    echo "    ⚪ No package.json, skipping"
    SKIPPED=$((SKIPPED + 1))
    cd "$ROOT_DIR"
    continue
  fi
  
  if ! grep -q '"build"' package.json 2>/dev/null; then
    echo "    ⚪ No build script, skipping"
    SKIPPED=$((SKIPPED + 1))
    cd "$ROOT_DIR"
    continue
  fi
  
  # Temporarily disable DTS if not already disabled
  if grep -q '"dts":\s*true\|dts:\s*{' tsup.config.ts 2>/dev/null; then
    # Check if already has dts: false
    if ! grep -q 'dts:\s*false' tsup.config.ts 2>/dev/null; then
      # Add dts: false temporarily
      sed -i.bak 's/dts:\s*{[^}]*}/dts: false \/\/ Temporarily disabled/g' tsup.config.ts 2>/dev/null || \
      sed -i.bak '/^export default defineConfig({/a\
  dts: false, // Temporarily disabled
' tsup.config.ts 2>/dev/null || true
    fi
  fi
  
  BUILD_LOG="/tmp/build-all-${PACKAGE_NAME//\//_}.log"
  
  if pnpm build > "$BUILD_LOG" 2>&1; then
    echo "    ✅ Build successful"
    SUCCESS=$((SUCCESS + 1))
  else
    echo "    ❌ Build failed"
    FAILED=$((FAILED + 1))
    
    # Show error summary (skip DTS errors)
    error_line=$(grep -i "error\|failed" "$BUILD_LOG" | grep -v "DTS Build error\|error occurred in dts" | head -1)
    if [ -n "$error_line" ]; then
      echo "       $(echo "$error_line" | sed 's/^[[:space:]]*//' | cut -c1-80)"
    fi
  fi
  
  # Restore original tsup.config.ts if backup exists
  if [ -f "tsup.config.ts.bak" ]; then
    mv tsup.config.ts.bak tsup.config.ts
  fi
  
  cd "$ROOT_DIR"
done

echo ""
echo "=== Summary ==="
echo "✅ Successful: $SUCCESS"
echo "❌ Failed: $FAILED"
echo "⚪ Skipped: $SKIPPED"
echo ""

if [ "$FAILED" -gt 0 ]; then
  echo "⚠️  Some builds failed. Check logs in /tmp/build-all-*.log"
  exit 1
else
  echo "🎉 All builds successful!"
  exit 0
fi


