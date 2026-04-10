#!/bin/bash
# check-migration-status.sh
# Check migration status for all KB Labs projects

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"

cd "$ROOT_DIR"

echo "=== KB Labs Migration Status Check ==="
echo ""

for dir in kb-labs-*; do
  if [ ! -d "$dir" ]; then
    continue
  fi

  echo "=== $dir ==="

  # Check if project has tsup.config.ts files
  tsup_configs=$(find "$dir" -name "tsup.config.ts" -type f 2>/dev/null | wc -l | tr -d ' ')

  if [ "$tsup_configs" -eq 0 ]; then
    echo "  ⚪ No tsup.config.ts found (skipping)"
    echo ""
    continue
  fi

  echo "  📦 Found $tsup_configs tsup.config.ts file(s)"

  # Check tsconfig.build.json files
  build_configs=$(find "$dir" -name "tsconfig.build.json" -type f 2>/dev/null | wc -l | tr -d ' ')
  echo "  📄 tsconfig.build.json: $build_configs file(s)"

  # Check if tsup.config.ts files reference tsconfig.build.json
  uses_build=$(grep -r "tsconfig.*build" "$dir"/*/tsup.config.ts "$dir"/tsup.config.ts 2>/dev/null | wc -l | tr -d ' ')
  echo "  ✅ Uses in tsup.config.ts: $uses_build file(s)"

  # Check tsup.external.json
  if [ -f "$dir/tsup.external.json" ]; then
    external_count=$(grep -c '"externals"' "$dir/tsup.external.json" 2>/dev/null || echo "0")
    echo "  📋 tsup.external.json: ✅ exists"
  else
    echo "  📋 tsup.external.json: ❌ missing"
  fi

  # Check DevKit version
  if [ -f "$dir/package.json" ]; then
    if grep -q "@kb-labs/devkit" "$dir/package.json"; then
      devkit_version=$(grep -A 1 '"@kb-labs/devkit"' "$dir/package.json" | grep -E '"(version|link|workspace)' | head -1 | sed 's/.*"\(.*\)".*/\1/' || echo "unknown")
      echo "  🔧 DevKit: ✅ ($devkit_version)"
    else
      echo "  🔧 DevKit: ❌ not found"
    fi
  fi

  # Migration status
  if [ "$build_configs" -gt 0 ] && [ "$uses_build" -gt 0 ] && [ -f "$dir/tsup.external.json" ]; then
    echo "  🎯 Status: ✅ MIGRATED"
  elif [ "$build_configs" -gt 0 ] || [ "$uses_build" -gt 0 ]; then
    echo "  🎯 Status: 🟡 PARTIAL"
  else
    echo "  🎯 Status: ❌ NOT MIGRATED"
  fi

  echo ""
done

echo "=== Summary ==="
total=$(ls -d kb-labs-* 2>/dev/null | wc -l | tr -d ' ')
migrated=$(for dir in kb-labs-*; do
  if [ -d "$dir" ]; then
    build_configs=$(find "$dir" -name "tsconfig.build.json" -type f 2>/dev/null | wc -l | tr -d ' ')
    uses_build=$(grep -r "tsconfig.*build" "$dir"/*/tsup.config.ts "$dir"/tsup.config.ts 2>/dev/null | wc -l | tr -d ' ')
    has_external=$(test -f "$dir/tsup.external.json" && echo "1" || echo "0")
    if [ "$build_configs" -gt 0 ] && [ "$uses_build" -gt 0 ] && [ "$has_external" -eq 1 ]; then
      echo "1"
    fi
  fi
done | wc -l | tr -d ' ')

echo "Total projects: $total"
echo "Migrated: $migrated"
echo "Remaining: $((total - migrated))"

