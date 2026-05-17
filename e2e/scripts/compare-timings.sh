#!/usr/bin/env bash
# Diff per-step durations between two E2E Platform Tests runs.
#
# Usage:
#   ./e2e/scripts/compare-timings.sh <baseline-run-id> <candidate-run-id>
#
# Both runs must have the `e2e-timings-<run_id>` artifact (added by the
# "Emit timings" step in .github/workflows/e2e-platform.yml). The script
# downloads the artifacts via `gh run download`, then prints a side-by-side
# table with deltas.
#
# Requires: gh (authenticated), jq.

set -euo pipefail

if [ $# -ne 2 ]; then
  echo "usage: $0 <baseline-run-id> <candidate-run-id>" >&2
  exit 2
fi

BASE_ID="$1"
CAND_ID="$2"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

fetch() {
  local id="$1" dest="$2"
  mkdir -p "$dest"
  if ! gh run download "$id" -n "e2e-timings-${id}" -D "$dest" 2>/dev/null; then
    echo "error: artifact e2e-timings-${id} not found on run ${id}" >&2
    echo "  (was the run done with .github/workflows/e2e-platform.yml that has the 'Emit timings' step?)" >&2
    exit 1
  fi
  if [ ! -f "$dest/timings.json" ]; then
    echo "error: timings.json missing in artifact for run ${id}" >&2
    exit 1
  fi
}

fetch "$BASE_ID" "$TMP/base"
fetch "$CAND_ID" "$TMP/cand"

# Print a unified table with step-by-step deltas. Step lists must match by
# name; new/missing steps are flagged.
jq -n \
  --slurpfile base "$TMP/base/timings.json" \
  --slurpfile cand "$TMP/cand/timings.json" '
  ($base[0].jobs[0].steps | map(.name)) as $bn |
  ($cand[0].jobs[0].steps | map(.name)) as $cn |
  ($base[0].jobs[0].steps | map({key:.name, value:.duration_s}) | from_entries) as $bs |
  ($cand[0].jobs[0].steps | map({key:.name, value:.duration_s}) | from_entries) as $cs |
  ($bn + $cn | unique) as $all |
  {
    base_run: $base[0].run_id,
    cand_run: $cand[0].run_id,
    rows: [ $all[] as $n | {
      step: $n,
      base_s: ($bs[$n] // null),
      cand_s: ($cs[$n] // null),
      delta_s: (
        if ($bs[$n] // null) == null or ($cs[$n] // null) == null
        then null
        else ($cs[$n] - $bs[$n])
        end
      )
    } ],
    total_base: ([$bs[]] | add),
    total_cand: ([$cs[]] | add)
  }
' > "$TMP/diff.json"

# Render the diff as a fixed-width table.
{
  printf "Baseline run:  %s\n" "$(jq -r '.base_run' "$TMP/diff.json")"
  printf "Candidate run: %s\n" "$(jq -r '.cand_run' "$TMP/diff.json")"
  echo
  printf "%-50s %8s %8s %8s\n" "step" "base(s)" "cand(s)" "Δ(s)"
  printf "%-50s %8s %8s %8s\n" "----" "-------" "-------" "----"
  jq -r '.rows[] | [.step, (.base_s // "-"|tostring), (.cand_s // "-"|tostring), (.delta_s // "-"|tostring)] | @tsv' "$TMP/diff.json" \
    | awk -F'\t' '{ printf "%-50s %8s %8s %8s\n", $1, $2, $3, $4 }'
  echo
  printf "%-50s %8s %8s %8s\n" "TOTAL" \
    "$(jq -r '.total_base | floor' "$TMP/diff.json")" \
    "$(jq -r '.total_cand | floor' "$TMP/diff.json")" \
    "$(jq -r '(.total_cand - .total_base) | floor' "$TMP/diff.json")"
}
