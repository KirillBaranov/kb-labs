#!/usr/bin/env bash
# check-dist-exports.sh
# Verify that every entry point declared in package.json (main, module, types,
# typings, exports, bin) actually exists in dist/, and that dist/ contains no
# bare directory imports. Bare directory imports (e.g. import '...') that
# resolve to a directory without an explicit /index.js suffix break Node ESM
# and some bundlers.
#
# CWD: package directory (set by release manager check runner)
# Exit 0 = pass, 1 = fail

set -euo pipefail

# 1. Collect every file path declared as an entry point in package.json.
ENTRIES=$(node -e '
const pkg = require("./package.json");
const out = new Set();

function collect(node) {
  if (typeof node === "string") {
    out.add(node);
  } else if (node && typeof node === "object") {
    for (const v of Object.values(node)) collect(v);
  }
}

for (const field of ["main", "module", "types", "typings"]) {
  if (pkg[field]) out.add(pkg[field]);
}
if (pkg.exports) collect(pkg.exports);
if (pkg.bin) collect(pkg.bin);

process.stdout.write([...out].join("\n"));
')

# SPA packages (no JS entries, ships an HTML shell) — skip JS checks entirely.
if [[ -z "$ENTRIES" ]] && [[ -f "dist/index.html" ]]; then
  echo "OK: SPA package detected (dist/index.html exists), skipping JS dist checks."
  exit 0
fi

# No declared entries at all — fall back to the legacy default so a silently
# unbuilt package (missing main/exports) still fails instead of passing free.
if [[ -z "$ENTRIES" ]]; then
  ENTRIES="dist/index.js"
fi

# 2. Only entries that resolve under dist/ are this check's concern — entries
#    outside dist/ (e.g. a root server.js, a federation host) are intentionally
#    not produced by this build pipeline.
MISSING=""
CHECKED=0
while IFS= read -r entry; do
  [[ -z "$entry" ]] && continue
  # Wildcard subpath export patterns (e.g. "./dist/*") map a whole directory,
  # not a single file — nothing concrete to stat, so skip them.
  [[ "$entry" == *'*'* ]] && continue
  norm="${entry#./}"
  [[ "$norm" != dist/* ]] && continue
  CHECKED=1
  if [[ ! -f "$norm" ]]; then
    MISSING+="  - $entry (expected at $norm)"$'\n'
  fi
done <<< "$ENTRIES"

if [[ "$CHECKED" -eq 0 ]]; then
  echo "OK: no declared entry points resolve under dist/, skipping dist checks."
  exit 0
fi

if [[ -n "$MISSING" ]]; then
  echo "ERROR: declared entry point(s) missing from dist/ — did you run 'pnpm build'?" >&2
  echo -n "$MISSING" >&2
  exit 1
fi

# 3. No bare directory imports: pattern matches import() or from/require()
#    pointing to a path that ends at a directory name (no .js/.ts/.json/.mjs/.cjs extension)
#    We allow: ./foo.js  ./foo/index.js  @scope/package
#    We disallow: ./foo  ../bar  ../../baz (no extension, not a bare specifier)
#    We skip: comment lines (// or *) and JSDoc type annotations ({import(...)})
BAD=$(grep -rE "(from|import|require)\(['\"](\./|\.\./)([^'\"]+)['\"]" dist/ \
  --include="*.js" --include="*.mjs" --include="*.cjs" 2>/dev/null \
  | grep -Ev "\.(js|ts|mjs|cjs|json|css|svg|png|wasm)(['\"]|\?)" \
  | grep -Ev "from ['\"][^./]" \
  | grep -Ev "^\s*(//|\*)" \
  | grep -Ev "\{import\(" \
  | grep -Ev ":[[:space:]]*(//|\*)" \
  || true)

if [[ -n "$BAD" ]]; then
  echo "ERROR: Found potential bare directory imports in dist/:" >&2
  echo "$BAD" >&2
  echo "" >&2
  echo "Ensure all internal imports include the file extension (e.g. './foo.js' not './foo')" >&2
  exit 1
fi

echo "OK: all declared dist/ entry points exist, no bare directory imports detected."
exit 0
