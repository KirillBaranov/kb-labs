#!/bin/bash
# verify-all-packages.sh
# Verify each package individually across all KB Labs projects

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"

cd "$ROOT_DIR"

echo "=== KB Labs Individual Package Verification ==="
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

TOTAL_PACKAGES=0
SUCCESS_BUILD=0
FAILED_BUILD=0
SUCCESS_BUNDLING=0
FAILED_BUNDLING=0
SKIPPED=0

for PROJECT in "${PROJECTS[@]}"; do
  if [ ! -d "$PROJECT" ]; then
    echo "⚠️  Skipping $PROJECT (not found)"
    continue
  fi
  
  echo "=== $PROJECT ==="
  
  # Find all packages with tsup.config.ts
  packages=$(find "$PROJECT" -name "tsup.config.ts" -type f -not -path "*/node_modules/*" -not -path "*/.ignored*" -not -path "*/fixtures/*" | while read -r file; do
    dirname "$file"
  done | sort -u)
  
  if [ -z "$packages" ]; then
    echo "  ⚪ No packages found"
    continue
  fi
  
  package_count=$(echo "$packages" | wc -l | tr -d ' ')
  echo "  Found $package_count package(s)"
  echo ""
  
  for PACKAGE_DIR in $packages; do
    TOTAL_PACKAGES=$((TOTAL_PACKAGES + 1))
    PACKAGE_NAME=$(basename "$PACKAGE_DIR")
    RELATIVE_PATH=$(echo "$PACKAGE_DIR" | sed "s|^$PROJECT/||")
    
    echo "  📦 $RELATIVE_PATH"
    
    cd "$PACKAGE_DIR"
    
    # Check if package.json exists
    if [ ! -f "package.json" ]; then
      echo "    ⚪ No package.json, skipping"
      SKIPPED=$((SKIPPED + 1))
      cd "$ROOT_DIR"
      continue
    fi
    
    # Check if build script exists
    if ! grep -q '"build"' package.json 2>/dev/null; then
      echo "    ⚪ No build script, skipping"
      SKIPPED=$((SKIPPED + 1))
      cd "$ROOT_DIR"
      continue
    fi
    
    # Try to build
    BUILD_LOG="/tmp/build-${PROJECT//\//_}-${PACKAGE_NAME}.log"
    if pnpm build > "$BUILD_LOG" 2>&1; then
      echo "    ✅ Build: OK"
      SUCCESS_BUILD=$((SUCCESS_BUILD + 1))
      
      # Check for workspace imports in dist files
      dist_files=$(find . -path "*/dist/*.js" -type f -not -path "*/node_modules/*" 2>/dev/null | head -5)
      
      if [ -n "$dist_files" ]; then
        workspace_imports=$(echo "$dist_files" | xargs grep -h "import.*@kb-labs" 2>/dev/null | wc -l | tr -d ' ')
        
        if [ "$workspace_imports" -gt 0 ]; then
          echo "    ✅ Bundling: Externalized ($workspace_imports imports)"
          SUCCESS_BUNDLING=$((SUCCESS_BUNDLING + 1))
          
          # Check bundle size
          largest_bundle=$(echo "$dist_files" | xargs du -k | sort -rn | head -1 | awk '{print $1}')
          if [ "$largest_bundle" -gt 500 ]; then
            echo "    ⚠️  Bundle size: ${largest_bundle}KB (large, might be bundled)"
          else
            echo "    ✅ Bundle size: ${largest_bundle}KB (OK)"
          fi
        else
          # Check if bundle is suspiciously large
          largest_bundle=$(echo "$dist_files" | xargs du -k | sort -rn | head -1 | awk '{print $1}')
          if [ "$largest_bundle" -gt 500 ]; then
            echo "    ⚠️  Bundling: No imports found, bundle ${largest_bundle}KB (might be bundled)"
            FAILED_BUNDLING=$((FAILED_BUNDLING + 1))
          else
            echo "    ✅ Bundling: No workspace imports (small bundle, OK)"
            SUCCESS_BUNDLING=$((SUCCESS_BUNDLING + 1))
          fi
        fi
      else
        echo "    ⚪ No dist files found"
      fi
      
      # Check for DTS errors (non-critical)
      if grep -q "DTS Build error\|error occurred in dts build" "$BUILD_LOG" 2>/dev/null; then
        echo "    ⚠️  DTS: Has errors (non-critical)"
      else
        echo "    ✅ DTS: OK"
      fi
      
    else
      echo "    ❌ Build: FAILED"
      FAILED_BUILD=$((FAILED_BUILD + 1))
      
      # Show error summary
      error_line=$(grep -i "error\|failed" "$BUILD_LOG" | head -1)
      if [ -n "$error_line" ]; then
        echo "       $(echo "$error_line" | cut -c1-80)"
      fi
    fi
    
    cd "$ROOT_DIR"
    echo ""
  done
  
  echo ""
done

echo "=== Summary ==="
echo "Total packages checked: $TOTAL_PACKAGES"
echo ""
echo "Builds:"
echo "  ✅ Successful: $SUCCESS_BUILD"
echo "  ❌ Failed: $FAILED_BUILD"
echo "  ⚪ Skipped: $SKIPPED"
echo ""
echo "Bundling:"
echo "  ✅ Correctly externalized: $SUCCESS_BUNDLING"
echo "  ⚠️  Might be bundled: $FAILED_BUNDLING"
echo ""

if [ "$FAILED_BUILD" -gt 0 ]; then
  echo "⚠️  Some builds failed. Check logs in /tmp/build-*.log"
  exit 1
else
  echo "🎉 All builds successful!"
  exit 0
fi


