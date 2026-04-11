#!/usr/bin/env bash
# check-dist-exports.sh
# Verify that dist/index.js exists and contains no bare directory imports.
# Bare directory imports (e.g. import '...') that resolve to a directory without
# an explicit /index.js suffix break Node ESM and some bundlers.
#
# CWD: package directory (set by release manager check runner)
# Exit 0 = pass, 1 = fail

set -euo pipefail

DIST_ENTRY="dist/index.js"

# 1. dist/index.js must exist
if [[ ! -f "$DIST_ENTRY" ]]; then
  echo "ERROR: $DIST_ENTRY not found — did you run 'pnpm build'?" >&2
  exit 1
fi

# 2. No bare directory imports: pattern matches import() or from/require()
#    pointing to a path that ends at a directory name (no .js/.ts/.json/.mjs/.cjs extension)
#    We allow: ./foo.js  ./foo/index.js  @scope/package
#    We disallow: ./foo  ../bar  ../../baz (no extension, not a bare specifier)
BAD=$(grep -rEo "(from|import|require)\(['\"](\./|\.\./)([^'\"]+)['\"]" dist/ \
  --include="*.js" --include="*.mjs" --include="*.cjs" 2>/dev/null \
  | grep -Ev "\.(js|ts|mjs|cjs|json|css|svg|png|wasm)(['\"]|\?)" \
  | grep -Ev "from ['\"][^./]" \
  || true)

if [[ -n "$BAD" ]]; then
  echo "ERROR: Found potential bare directory imports in dist/:" >&2
  echo "$BAD" >&2
  echo "" >&2
  echo "Ensure all internal imports include the file extension (e.g. './foo.js' not './foo')" >&2
  exit 1
fi

echo "OK: $DIST_ENTRY exists, no bare directory imports detected."
exit 0
