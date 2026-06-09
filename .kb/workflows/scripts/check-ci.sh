#!/usr/bin/env bash
# Step: Check CI Status
# Env: OWNER, REPO, PR_NUMBER, BRANCH_NAME
# Returns: passed | pending | fix_needed

REPO_FULL="$OWNER/$REPO"
LOGS_FILE="/tmp/kb-ci-logs-${PR_NUMBER}.txt"

echo "Checking CI for PR #${PR_NUMBER} (branch: ${BRANCH_NAME})..."
sleep 15

# --- Primary: gh pr checks ---
CHECKS=$(gh pr checks "$PR_NUMBER" --repo "$REPO_FULL" \
  --json name,state,bucket 2>/dev/null || echo '[]')

TOTAL=$(echo "$CHECKS"   | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d).length)}catch{console.log(0)}})")
PENDING=$(echo "$CHECKS" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const cs=JSON.parse(d);console.log(cs.filter(c=>c.bucket==='pending').length)}catch{console.log(0)}})")
FAILED=$(echo "$CHECKS"  | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const cs=JSON.parse(d);console.log(cs.filter(c=>c.bucket==='fail').length)}catch{console.log(0)}})")

echo "gh pr checks → Total: $TOTAL  Pending: $PENDING  Failed: $FAILED"

# lint/type-check/test only appear after Build TS (~9 min).
# CodeQL + Analyze(3) + Go tools + Deps + kb-create-e2e + Build TS + lint + type-check + test = 10+
MIN_CHECKS=8

if [ "$TOTAL" -ge "$MIN_CHECKS" ]; then
  # Enough checks visible — trust gh pr checks result
  if [ "$PENDING" -gt "0" ]; then
    echo "CI still running ($PENDING pending)."
    echo '::kb-output::{"decision":"pending","hasLogs":false,"ciLogsFile":""}'
    exit 0
  elif [ "$FAILED" = "0" ]; then
    echo "All CI checks passed!"
    echo '::kb-output::{"decision":"passed","hasLogs":false,"ciLogsFile":""}'
    exit 0
  fi
  # else: fall through to log collection below
fi

# --- Fallback: gh run list when pr checks shows < MIN_CHECKS ---
# After a force-push, gh pr checks can return 0 for several minutes.
# gh run list --branch is more reliable for detecting actual failures.
RUNS=$(gh run list --repo "$REPO_FULL" --branch "$BRANCH_NAME" \
  --json databaseId,status,conclusion,name,createdAt \
  --limit 10 2>/dev/null || echo '[]')

RUNS_TOTAL=$(echo "$RUNS"   | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d).length)}catch{console.log(0)}})")
RUNS_PENDING=$(echo "$RUNS" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const rs=JSON.parse(d);console.log(rs.filter(r=>r.status==='in_progress'||r.status==='queued'||r.status==='waiting').length)}catch{console.log(0)}})")
RUNS_FAILED=$(echo "$RUNS"  | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const rs=JSON.parse(d);console.log(rs.filter(r=>r.conclusion==='failure').length)}catch{console.log(0)}})")
RUNS_SUCCESS=$(echo "$RUNS" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const rs=JSON.parse(d);console.log(rs.filter(r=>r.conclusion==='success').length)}catch{console.log(0)}})")

echo "gh run list   → Total: $RUNS_TOTAL  Pending: $RUNS_PENDING  Failed: $RUNS_FAILED  Success: $RUNS_SUCCESS"

if [ "$RUNS_TOTAL" = "0" ]; then
  # No runs at all yet — checks haven't started
  echo "No CI runs found yet — waiting."
  echo '::kb-output::{"decision":"pending","hasLogs":false,"ciLogsFile":""}'
  exit 0
fi

if [ "$RUNS_PENDING" -gt "0" ]; then
  echo "CI runs still in progress ($RUNS_PENDING pending)."
  echo '::kb-output::{"decision":"pending","hasLogs":false,"ciLogsFile":""}'
  exit 0
fi

if [ "$RUNS_FAILED" = "0" ] && [ "$RUNS_TOTAL" -gt "0" ]; then
  echo "All CI runs passed!"
  echo '::kb-output::{"decision":"passed","hasLogs":false,"ciLogsFile":""}'
  exit 0
fi

# --- Collect logs from failed run ---
echo "CI checks failed ($RUNS_FAILED failed run(s)). Collecting logs..."
FAILED_RUN=$(echo "$RUNS" | node -e "
  let d='';
  process.stdin.on('data',c=>d+=c).on('end',()=>{
    try {
      const rs = JSON.parse(d);
      const f = rs.find(r => r.conclusion === 'failure');
      console.log(f ? f.databaseId : '');
    } catch { console.log(''); }
  })")

if [ -n "$FAILED_RUN" ]; then
  echo "Fetching logs for run $FAILED_RUN..."
  gh run view "$FAILED_RUN" --repo "$REPO_FULL" --log-failed 2>/dev/null | tail -300 > "$LOGS_FILE"
else
  echo "Failed run ID not found." > "$LOGS_FILE"
fi

LOGS_JSON=$(node -e "console.log(JSON.stringify({decision:'fix_needed',hasLogs:true,ciLogsFile:process.argv[1]}))" "$LOGS_FILE")
echo "::kb-output::$LOGS_JSON"
