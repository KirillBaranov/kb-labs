#!/usr/bin/env bash
# check-pack-install.sh
# Pack the package with 'npm pack' and verify:
#   1. The tarball is produced
#   2. All declared exports paths exist inside the tarball
#   3. The main entry file is valid JavaScript (node --check)
#
# CWD: package directory (set by release manager check runner)
# Exit 0 = pass, 1 = fail

set -euo pipefail

WORK_DIR=$(mktemp -d)
trap 'rm -rf "$WORK_DIR"' EXIT

PKG_JSON="package.json"

if [[ ! -f "$PKG_JSON" ]]; then
  echo "ERROR: package.json not found in $(pwd)" >&2
  exit 1
fi

PKG_NAME=$(node -e "process.stdout.write(require('./package.json').name || '')")

echo "Packing $PKG_NAME..."
TARBALL=$(npm pack --pack-destination "$WORK_DIR" --quiet 2>/dev/null | tail -1)
TARBALL_PATH="$WORK_DIR/$TARBALL"

if [[ ! -f "$TARBALL_PATH" ]]; then
  echo "ERROR: npm pack did not produce a tarball" >&2
  exit 1
fi

echo "Extracting $TARBALL..."
tar -xzf "$TARBALL_PATH" -C "$WORK_DIR"

EXTRACTED="$WORK_DIR/package"

# Collect all entry points declared in package.json
ENTRIES=$(node -e "
  const p = require('./package.json');
  const entries = new Set();

  // main / module
  if (p.main) entries.add(p.main);
  if (p.module) entries.add(p.module);

  // exports map — collect all leaf string values
  function walk(obj) {
    if (typeof obj === 'string') { entries.add(obj); return; }
    if (obj && typeof obj === 'object') { Object.values(obj).forEach(walk); }
  }
  if (p.exports) walk(p.exports);

  // types
  if (p.types) entries.add(p.types);
  if (p.typings) entries.add(p.typings);

  // filter to files that should exist (skip conditions like 'import', 'require', 'types')
  const files = [...entries].filter(e =>
    typeof e === 'string' &&
    (e.startsWith('./') || e.startsWith('dist/')) &&
    !e.includes('*')
  );
  process.stdout.write(files.join('\n'));
")

FAILED=0
while IFS= read -r ENTRY; do
  [[ -z "$ENTRY" ]] && continue
  # Strip leading ./
  REL="${ENTRY#./}"
  FULL="$EXTRACTED/$REL"
  if [[ ! -f "$FULL" ]]; then
    echo "ERROR: declared entry '$ENTRY' missing from packed tarball" >&2
    FAILED=1
  else
    echo "  OK: $ENTRY"
  fi
done <<< "$ENTRIES"

if [[ $FAILED -eq 1 ]]; then
  echo "" >&2
  echo "Packed files:" >&2
  find "$EXTRACTED" -type f | sed "s|$EXTRACTED/||" | sort >&2
  exit 1
fi

# Syntax-check the main JS entry
MAIN_ENTRY=$(node -e "
  const p = require('./package.json');
  const entry = p.exports?.['.']?.import ?? p.exports?.['.']?.require ?? p.main ?? 'dist/index.js';
  process.stdout.write(entry.replace(/^\.\//, ''));
")

MAIN_FULL="$EXTRACTED/$MAIN_ENTRY"
if [[ -f "$MAIN_FULL" ]]; then
  echo "Syntax-checking $MAIN_ENTRY..."
  if ! node --check "$MAIN_FULL" 2>&1; then
    echo "ERROR: $MAIN_ENTRY failed syntax check" >&2
    exit 1
  fi
  echo "  OK: syntax valid"
fi

echo "OK: $PKG_NAME packs correctly — all declared exports present."
exit 0
