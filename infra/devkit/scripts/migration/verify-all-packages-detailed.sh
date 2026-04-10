#!/bin/bash
# verify-all-packages-detailed.sh
# Detailed verification with JSON output for analysis

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"

cd "$ROOT_DIR"

OUTPUT_FILE="/tmp/package-verification.json"
RESULTS=()

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

for PROJECT in "${PROJECTS[@]}"; do
  if [ ! -d "$PROJECT" ]; then
    continue
  fi
  
  packages=$(find "$PROJECT" -name "tsup.config.ts" -type f -not -path "*/node_modules/*" -not -path "*/.ignored*" -not -path "*/fixtures/*" | while read -r file; do
    dirname "$file"
  done | sort -u)
  
  for PACKAGE_DIR in $packages; do
    PACKAGE_NAME=$(basename "$PACKAGE_DIR")
    RELATIVE_PATH=$(echo "$PACKAGE_DIR" | sed "s|^$PROJECT/||")
    
    cd "$PACKAGE_DIR"
    
    if [ ! -f "package.json" ] || ! grep -q '"build"' package.json 2>/dev/null; then
      cd "$ROOT_DIR"
      continue
    fi
    
    BUILD_LOG="/tmp/build-${PROJECT//\//_}-${PACKAGE_NAME}.log"
    BUILD_SUCCESS=false
    BUNDLING_OK=false
    DTS_OK=false
    BUNDLE_SIZE=0
    WORKSPACE_IMPORTS=0
    ERROR_MSG=""
    
    # Try build
    if pnpm build > "$BUILD_LOG" 2>&1; then
      BUILD_SUCCESS=true
      
      # Check bundling
      dist_files=$(find . -path "*/dist/*.js" -type f -not -path "*/node_modules/*" 2>/dev/null | head -5)
      if [ -n "$dist_files" ]; then
        WORKSPACE_IMPORTS=$(echo "$dist_files" | xargs grep -h "import.*@kb-labs" 2>/dev/null | wc -l | tr -d ' ')
        BUNDLE_SIZE=$(echo "$dist_files" | xargs du -k | sort -rn | head -1 | awk '{print $1}')
        
        if [ "$WORKSPACE_IMPORTS" -gt 0 ] || [ "$BUNDLE_SIZE" -lt 500 ]; then
          BUNDLING_OK=true
        fi
      fi
      
      # Check DTS
      if ! grep -q "DTS Build error\|error occurred in dts build" "$BUILD_LOG" 2>/dev/null; then
        DTS_OK=true
      fi
    else
      ERROR_MSG=$(grep -i "error\|failed" "$BUILD_LOG" | head -1 | sed 's/"/\\"/g' | cut -c1-100)
    fi
    
    RESULTS+=("{\"project\":\"$PROJECT\",\"package\":\"$RELATIVE_PATH\",\"build\":$BUILD_SUCCESS,\"bundling\":$BUNDLING_OK,\"dts\":$DTS_OK,\"bundle_size_kb\":$BUNDLE_SIZE,\"workspace_imports\":$WORKSPACE_IMPORTS,\"error\":\"$ERROR_MSG\"}")
    
    cd "$ROOT_DIR"
  done
done

# Output JSON
echo "["
for i in "${!RESULTS[@]}"; do
  echo -n "${RESULTS[$i]}"
  if [ $i -lt $((${#RESULTS[@]} - 1)) ]; then
    echo ","
  else
    echo ""
  fi
done
echo "]"


