#!/usr/bin/env bash
# Pack all publishable @kb-labs/* packages into tarballs.
# Output goes to e2e/packages/ by default (first arg overrides).
#
# Must be run AFTER pnpm install + kb-devkit run build.
#
# Usage:
#   ./e2e/scripts/pack-all.sh
#   ./e2e/scripts/pack-all.sh /custom/output/dir

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT_DIR="${1:-$REPO_ROOT/e2e/packages}"

mkdir -p "$OUT_DIR"
# Clean previous packs so stale tarballs don't accumulate
rm -f "$OUT_DIR"/*.tgz 2>/dev/null || true

echo "==> Packing all @kb-labs/* packages → $OUT_DIR"

PACKED=0
SKIPPED=0
FAILED=0

# Iterate every package.json in the repo (excluding node_modules and .kb)
while IFS= read -r pkg_json; do
  pkg_dir="$(dirname "$pkg_json")"

  # Read name + private flag
  pkg_name="$(jq -r '.name // ""' "$pkg_json" 2>/dev/null)"
  pkg_private="$(jq -r '.private // false' "$pkg_json" 2>/dev/null)"

  # Skip non-@kb-labs, private, and the root monorepo package
  [[ "$pkg_name" == @kb-labs/* ]] || continue
  [ "$pkg_name" != "@kb-labs/monorepo" ] || continue
  [ "$pkg_private" != "true" ] || { SKIPPED=$((SKIPPED+1)); continue; }

  # Skip if no dist/ and package declares dist-relative exports
  # (means it wasn't built — pnpm pack would produce an empty tarball)
  has_exports="$(jq -r '(.main // .exports // "") | tostring' "$pkg_json" 2>/dev/null)"
  if [[ "$has_exports" == *"dist"* ]] && [ ! -d "$pkg_dir/dist" ]; then
    echo "  WARN skip (not built): $pkg_name"
    SKIPPED=$((SKIPPED+1))
    continue
  fi

  if (cd "$pkg_dir" && pnpm pack --pack-destination "$OUT_DIR" --silent 2>/dev/null); then
    PACKED=$((PACKED+1))
  else
    echo "  WARN pack failed: $pkg_name"
    FAILED=$((FAILED+1))
  fi

done < <(find "$REPO_ROOT" \
  -not -path "*/node_modules/*" \
  -not -path "*/.kb/*" \
  -not -path "*/e2e/*" \
  -not -path "*/.git/*" \
  -not -path "*/.claude/*" \
  -name "package.json" \
  | sort)

echo ""
echo "==> Done: $PACKED packed, $SKIPPED skipped (private/not-built), $FAILED failed"
echo "    Output: $OUT_DIR ($(ls "$OUT_DIR"/*.tgz 2>/dev/null | wc -l | tr -d ' ') tarballs)"

if [ "$FAILED" -gt 0 ]; then
  echo "ERROR: $FAILED packages failed to pack"
  exit 1
fi
