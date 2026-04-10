#!/usr/bin/env bash
# Merge all per-package lcov coverage reports into a single report.
# Usage: ./scripts/merge-coverage.sh
#
# Produces:
#   coverage/merged.lcov    — combined lcov report
#   coverage/html/          — HTML report (if lcov/genhtml available)

set -euo pipefail

OUT_DIR="coverage"
MERGED="$OUT_DIR/merged.lcov"

mkdir -p "$OUT_DIR"
rm -f "$MERGED"

echo "Collecting TS coverage reports..."
ts_count=0
find . -path "*/coverage/lcov.info" -not -path "./node_modules/*" -not -path "./coverage/*" | while read -r f; do
  cat "$f" >> "$MERGED"
  ts_count=$((ts_count + 1))
  echo "  + $f"
done

echo "Collecting Go coverage reports..."
for f in $(find ./tools -name "coverage.out" 2>/dev/null); do
  # Convert Go coverage to lcov via go-tool-cover if available
  if command -v gcov2lcov &>/dev/null; then
    gcov2lcov -infile="$f" -outfile="$f.lcov"
    cat "$f.lcov" >> "$MERGED"
    echo "  + $f (converted to lcov)"
  else
    echo "  ~ $f (skipped — install gcov2lcov for Go→lcov conversion)"
  fi
done

if [ ! -f "$MERGED" ]; then
  echo "No coverage reports found. Run: kb-devkit run test:coverage"
  exit 1
fi

lines=$(wc -l < "$MERGED")
echo ""
echo "Merged report: $MERGED ($lines lines)"

# Generate HTML if genhtml is available
if command -v genhtml &>/dev/null; then
  genhtml "$MERGED" --output-directory "$OUT_DIR/html" --quiet
  echo "HTML report:   $OUT_DIR/html/index.html"
else
  echo "Install lcov for HTML reports: brew install lcov"
fi
