#!/usr/bin/env bash
# Validate a packed package directory before it is restored from or written to
# a registry cache. This is intentionally independent from pack-all.sh so CI
# can validate cache hits too.
set -euo pipefail

PACKAGE_DIR="${1:?usage: validate-packed-packages.sh <package-dir>}"
INVALID=0
COUNT=0

for tarball in "$PACKAGE_DIR"/*.tgz; do
  [ -f "$tarball" ] || continue
  COUNT=$((COUNT+1))
  if ! tar -xOzf "$tarball" package/package.json 2>/dev/null \
    | jq -e '[.. | strings | select(startswith("workspace:"))] | length == 0' >/dev/null; then
    echo "ERROR: workspace dependency leaked into $(basename "$tarball")"
    INVALID=$((INVALID+1))
  fi
done

if [ "$COUNT" -eq 0 ]; then
  echo "ERROR: no package tarballs found in $PACKAGE_DIR"
  exit 1
fi
if [ "$INVALID" -gt 0 ]; then
  echo "ERROR: $INVALID invalid package tarballs in $PACKAGE_DIR"
  exit 1
fi
echo "Validated $COUNT package tarballs in $PACKAGE_DIR"
