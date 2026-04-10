#!/usr/bin/env bash
# Mind Engine Search Quality Benchmarks
# Always runs from /Users/kirillbaranov/Desktop/kb-labs

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

REQUIRED_ROOT="/Users/kirillbaranov/Desktop/kb-labs"
RUNS="${RUNS:-3}"
RESULTS_CSV="${RESULTS_CSV:-/tmp/mind-benchmark-results.csv}"

# Thresholds
EASY_THRESHOLD=0.5
MEDIUM_THRESHOLD=0.6
HARD_THRESHOLD=0.6

declare -a QUERIES=(
  "EASY|${EASY_THRESHOLD}|What is VectorStore interface and what methods does it have?"
  "MEDIUM|${MEDIUM_THRESHOLD}|How does hybrid search work in mind-engine? What algorithms does it use?"
  "HARD|${HARD_THRESHOLD}|Explain the anti-hallucination architecture in mind-engine. How does it verify answers and what strategies does it use to prevent hallucinations?"
)

if [[ ! -d "$REQUIRED_ROOT" ]]; then
  echo -e "${RED}Required workspace not found: $REQUIRED_ROOT${NC}"
  exit 2
fi

if ! command -v jq >/dev/null 2>&1; then
  echo -e "${RED}jq is required but not installed.${NC}"
  exit 2
fi

cd "$REQUIRED_ROOT"

echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}           Mind Engine Search Quality Benchmarks               ${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo "Working directory: $(pwd)"
echo "Runs: $RUNS"
echo "Results CSV: $RESULTS_CSV"
echo ""

# Clear cache for cleaner baseline
rm -rf .kb/cache/* 2>/dev/null || true

# CSV header
echo "run,label,threshold,confidence,mode,timingMs,tokensIn,tokensOut,complete,pass" > "$RESULTS_CSV"

run_single_benchmark() {
  local run_id="$1"
  local label="$2"
  local threshold="$3"
  local query="$4"

  echo -e "${YELLOW}Run $run_id | $label${NC}"
  echo "Query: $query"

  local raw
  raw=$(env NODE_OPTIONS="--max-old-space-size=4096 --expose-gc" \
    pnpm kb mind rag-query --text "$query" --agent --json 2>&1 || true)

  # Take last JSON line from mixed logs.
  local json
  json=$(printf "%s\n" "$raw" | awk '/^\{/{line=$0} END{print line}')

  local confidence="0"
  local mode="unknown"
  local timing_ms="0"
  local tokens_in="0"
  local tokens_out="0"
  local complete="false"

  if [[ -n "$json" ]] && echo "$json" | jq -e . >/dev/null 2>&1; then
    confidence=$(echo "$json" | jq -r '.confidence // 0')
    mode=$(echo "$json" | jq -r '.meta.mode // "unknown"')
    timing_ms=$(echo "$json" | jq -r '.meta.timingMs // 0')
    tokens_in=$(echo "$json" | jq -r '.meta.tokensIn // 0')
    tokens_out=$(echo "$json" | jq -r '.meta.tokensOut // 0')
    complete=$(echo "$json" | jq -r '.complete // false')
  else
    echo -e "${RED}Could not parse JSON response for $label.${NC}"
  fi

  local pass
  pass=$(awk -v c="$confidence" -v t="$threshold" 'BEGIN{print (c>=t)?1:0}')

  if [[ "$pass" -eq 1 ]]; then
    echo -e "${GREEN}✓ PASS${NC} confidence=$confidence threshold=$threshold mode=$mode timingMs=$timing_ms"
  else
    echo -e "${RED}✗ FAIL${NC} confidence=$confidence threshold=$threshold mode=$mode timingMs=$timing_ms"
  fi

  echo "$run_id,$label,$threshold,$confidence,$mode,$timing_ms,$tokens_in,$tokens_out,$complete,$pass" >> "$RESULTS_CSV"
  echo ""
}

echo -e "${BLUE}───────────────────────────────────────────────────────────────${NC}"
echo -e "${BLUE}                    Running Benchmarks                         ${NC}"
echo -e "${BLUE}───────────────────────────────────────────────────────────────${NC}"
echo ""

for ((run=1; run<=RUNS; run++)); do
  for item in "${QUERIES[@]}"; do
    IFS='|' read -r label threshold query <<< "$item"
    run_single_benchmark "$run" "$label" "$threshold" "$query"
  done
done

echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}                         Summary                               ${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""

awk -F, '
  NR==1 { next }
  {
    sum_conf += $4
    sum_time += $6
    pass += $10
    total += 1

    label_conf[$2] += $4
    label_count[$2] += 1
    label_pass[$2] += $10

    run_conf[$1] += $4
    run_count[$1] += 1
    run_pass[$1] += $10
  }
  END {
    if (total == 0) {
      print "No benchmark data collected."
      exit 1
    }

    printf("Overall avg confidence: %.4f\n", sum_conf / total)
    printf("Pass rate: %d/%d\n", pass, total)
    printf("Overall avg timing: %.0f ms\n", sum_time / total)
    print ""

    print "By label:"
    for (l in label_conf) {
      printf("  %s -> avg_conf=%.4f pass=%d/%d\n", l, label_conf[l] / label_count[l], label_pass[l], label_count[l])
    }
    print ""

    print "By run:"
    for (r in run_conf) {
      printf("  run %s -> avg_conf=%.4f pass=%d/%d\n", r, run_conf[r] / run_count[r], run_pass[r], run_count[r])
    }
  }
' "$RESULTS_CSV"

echo ""
echo "Saved raw results to: $RESULTS_CSV"
