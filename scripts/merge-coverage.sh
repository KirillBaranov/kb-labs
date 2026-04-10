#!/usr/bin/env bash
# Merge all per-package coverage reports into a single summary.
#
# Usage:
#   ./scripts/merge-coverage.sh          # human output + HTML
#   ./scripts/merge-coverage.sh --json   # machine-readable JSON for agents
#
# Produces:
#   coverage/merged.lcov    — combined lcov report (for HTML)
#   coverage/summary.json   — per-package coverage summary

set -euo pipefail

JSON_MODE=false
[[ "${1:-}" == "--json" ]] && JSON_MODE=true

OUT_DIR="coverage"
MERGED="$OUT_DIR/merged.lcov"
SUMMARY="$OUT_DIR/summary.json"

mkdir -p "$OUT_DIR"
rm -f "$MERGED" "$SUMMARY"

# ── Collect lcov for HTML report ────────────────────────────────────────────
find . -path "*/coverage/lcov.info" -not -path "./node_modules/*" -not -path "./coverage/*" -print0 2>/dev/null | while IFS= read -r -d '' f; do
  cat "$f" >> "$MERGED"
  $JSON_MODE || echo "  + $f"
done

# ── Collect Go coverage ────────────────────────────────────────────────────
for f in $(find ./tools -name "coverage.out" 2>/dev/null); do
  if command -v gcov2lcov &>/dev/null; then
    gcov2lcov -infile="$f" -outfile="$f.lcov"
    cat "$f.lcov" >> "$MERGED"
    $JSON_MODE || echo "  + $f (converted to lcov)"
  else
    $JSON_MODE || echo "  ~ $f (skipped — install gcov2lcov for Go→lcov conversion)"
  fi
done

# ── Parse per-package coverage ──────────────────────────────────────────────
python3 -c "
import json, os, sys

packages = []
ts, th, bs, bh_t, fs, fh_t = 0, 0, 0, 0, 0, 0

root = os.getcwd()

for dirpath, _, filenames in os.walk('.'):
    if 'node_modules' in dirpath or dirpath == './coverage':
        continue

    # Prefer coverage-final.json (Istanbul format, accurate counts)
    # Fall back to lcov.info (may have v8 zero-DA issue)
    cov_final = os.path.join(dirpath, 'coverage-final.json')
    lcov_path = os.path.join(dirpath, 'lcov.info')

    if not os.path.exists(cov_final) and not os.path.exists(lcov_path):
        continue

    # Only process coverage/ directories
    if os.path.basename(dirpath) != 'coverage':
        continue

    pkg_dir = os.path.dirname(dirpath)
    pkg_json = os.path.join(pkg_dir, 'package.json')
    pkg_name = pkg_dir.lstrip('./')
    if os.path.exists(pkg_json):
        try:
            with open(pkg_json) as f:
                pkg_name = json.load(f).get('name', pkg_name)
        except:
            pass

    stmts_hit, stmts_total = 0, 0
    br_hit, br_total = 0, 0
    fn_hit, fn_total = 0, 0

    if os.path.exists(cov_final):
        # Istanbul coverage-final.json — accurate per-statement counts
        try:
            with open(cov_final) as f:
                data = json.load(f)
            for file_path, file_cov in data.items():
                s = file_cov.get('s', {})
                stmts_total += len(s)
                stmts_hit += sum(1 for v in s.values() if v > 0)

                b = file_cov.get('b', {})
                for branches in b.values():
                    br_total += len(branches)
                    br_hit += sum(1 for v in branches if v > 0)

                fn = file_cov.get('f', {})
                fn_total += len(fn)
                fn_hit += sum(1 for v in fn.values() if v > 0)
        except:
            continue
    elif os.path.exists(lcov_path):
        # lcov.info fallback — use FNF/FNH (functions are reliable in v8)
        with open(lcov_path) as f:
            for line in f:
                if line.startswith('FNF:'):
                    fn_total += int(line[4:].strip())
                elif line.startswith('FNH:'):
                    fn_hit += int(line[4:].strip())
                elif line.startswith('DA:'):
                    parts = line[3:].strip().split(',')
                    if len(parts) >= 2:
                        stmts_total += 1
                        if int(parts[1]) > 0:
                            stmts_hit += 1
                elif line.startswith('BRDA:'):
                    br_total += 1
                    parts = line[5:].strip().split(',')
                    if len(parts) >= 4 and parts[3] not in ('-', '0'):
                        br_hit += 1

    stmts_pct = round(stmts_hit / stmts_total * 100, 1) if stmts_total > 0 else 0
    br_pct = round(br_hit / br_total * 100, 1) if br_total > 0 else 0
    fn_pct = round(fn_hit / fn_total * 100, 1) if fn_total > 0 else 0

    packages.append({
        'package': pkg_name,
        'statements': {'hit': stmts_hit, 'total': stmts_total, 'pct': stmts_pct},
        'branches': {'hit': br_hit, 'total': br_total, 'pct': br_pct},
        'functions': {'hit': fn_hit, 'total': fn_total, 'pct': fn_pct},
    })

    ts += stmts_total; th += stmts_hit
    bs += br_total; bh_t += br_hit
    fs += fn_total; fh_t += fn_hit

# Sort by statements coverage ascending (worst first)
packages.sort(key=lambda p: p['statements']['pct'])

result = {
    'ok': True,
    'total': {
        'packages': len(packages),
        'statements': {'hit': th, 'total': ts, 'pct': round(th/ts*100,1) if ts else 0},
        'branches': {'hit': bh_t, 'total': bs, 'pct': round(bh_t/bs*100,1) if bs else 0},
        'functions': {'hit': fh_t, 'total': fs, 'pct': round(fh_t/fs*100,1) if fs else 0},
    },
    'worst': packages[:20],
    'packages': packages,
}

json.dump(result, sys.stdout, indent=2)
" > "$SUMMARY"

if $JSON_MODE; then
  cat "$SUMMARY"
  exit 0
fi

# ── Human output ────────────────────────────────────────────────────────────
echo ""
python3 -c "
import json
with open('$SUMMARY') as f:
    d = json.load(f)
t = d['total']
print(f'''Coverage Summary ({t['packages']} packages)
  Statements: {t['statements']['pct']}%  ({t['statements']['hit']}/{t['statements']['total']})
  Branches:   {t['branches']['pct']}%  ({t['branches']['hit']}/{t['branches']['total']})
  Functions:  {t['functions']['pct']}%  ({t['functions']['hit']}/{t['functions']['total']})

Worst covered (bottom 10):''')
for p in d['worst'][:10]:
    print(f\"  {p['statements']['pct']:5.1f}%  {p['package']}\")
"

# Generate HTML if genhtml is available
if [ -f "$MERGED" ] && command -v genhtml &>/dev/null; then
  genhtml "$MERGED" --output-directory "$OUT_DIR/html" --quiet --ignore-errors source,source,category --synthesize-missing 2>/dev/null
  echo ""
  echo "HTML report: $OUT_DIR/html/index.html"
fi
echo "JSON report: $SUMMARY"
