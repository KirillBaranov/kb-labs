#!/usr/bin/env bash
# Step: Check CI Status
# Env: OWNER, REPO, PR_NUMBER, BRANCH_NAME
#      CI_TIMEOUT_SECONDS  — wall-clock timeout before declaring stuck (default: 3600)
#      CI_MIN_CHECKS       — minimum checks expected before declaring "passed" (default: 1)
#      CI_START_TIME       — unix timestamp when polling began (set on first call, reused on retry)
# Returns: passed | pending | fix_needed

REPO_FULL="$OWNER/$REPO"
LOGS_FILE="/tmp/kb-ci-logs-${PR_NUMBER}.txt"
TIMEOUT="${CI_TIMEOUT_SECONDS:-3600}"
MIN_CHECKS="${CI_MIN_CHECKS:-1}"

# Persist start time across gate retries via a temp file keyed by PR
START_FILE="/tmp/kb-ci-start-${PR_NUMBER}.txt"
if [ ! -f "$START_FILE" ]; then
  date +%s > "$START_FILE"
fi
START_TIME=$(cat "$START_FILE")
NOW=$(date +%s)
ELAPSED=$(( NOW - START_TIME ))

echo "Checking CI for PR #${PR_NUMBER} (branch: ${BRANCH_NAME}, elapsed: ${ELAPSED}s / timeout: ${TIMEOUT}s)..."

# Wall-clock timeout guard
if [ "$ELAPSED" -gt "$TIMEOUT" ]; then
  echo "CI timeout reached after ${ELAPSED}s. Treating as failure to unblock pipeline."
  echo "Timeout — collecting latest logs..." > "$LOGS_FILE"
  LATEST_RUN=$(gh run list --repo "$REPO_FULL" --branch "$BRANCH_NAME" \
    --json databaseId,conclusion --limit 3 2>/dev/null \
    | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{
        try{const rs=JSON.parse(d);const f=rs.find(r=>r.conclusion==='failure')||rs[0];console.log(f?f.databaseId:'')}catch{console.log('')}
      })")
  [ -n "$LATEST_RUN" ] && gh run view "$LATEST_RUN" --repo "$REPO_FULL" --log-failed 2>/dev/null | tail -300 >> "$LOGS_FILE"
  rm -f "$START_FILE"
  LOGS_JSON=$(node -e "console.log(JSON.stringify({decision:'fix_needed',hasLogs:true,ciLogsFile:process.argv[1]}))" "$LOGS_FILE")
  echo "::kb-output::$LOGS_JSON"
  exit 0
fi

sleep 15

# --- Get HEAD SHA for this branch (filters out stale checks from old pushes) ---
SHA=$(cd "${KB_WORKSPACE_ROOT:-$(pwd)}" && git rev-parse HEAD 2>/dev/null)
if [ -z "$SHA" ]; then
  SHA=$(gh api "repos/$REPO_FULL/git/refs/heads/$BRANCH_NAME" --jq '.object.sha' 2>/dev/null)
fi
echo "HEAD SHA: ${SHA:0:12}..."

# --- Query check-runs for this exact commit ---
if [ -n "$SHA" ]; then
  CHECKS_RAW=$(gh api "repos/$REPO_FULL/commits/$SHA/check-runs" \
    --paginate --jq '[.check_runs[] | {name:.name, status:.status, conclusion:.conclusion}]' \
    2>/dev/null | node -e "
      let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{
        try{
          // paginate returns multiple arrays — flatten
          const raw=d.trim();
          const arrays=[];let depth=0,start=0;
          for(let i=0;i<raw.length;i++){
            if(raw[i]==='[')depth++;else if(raw[i]===']'){depth--;if(depth===0){arrays.push(raw.slice(start,i+1));start=i+1;}}
          }
          const all=arrays.flatMap(a=>{try{return JSON.parse(a)}catch{return []}});
          console.log(JSON.stringify(all));
        }catch{console.log('[]')}
      })")

  TOTAL=$(echo "$CHECKS_RAW"   | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d).length)}catch{console.log(0)}})")
  PENDING=$(echo "$CHECKS_RAW" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d).filter(c=>c.status!=='completed').length)}catch{console.log(0)}})")
  FAILED=$(echo "$CHECKS_RAW"  | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d).filter(c=>c.status==='completed'&&c.conclusion!=='success'&&c.conclusion!=='neutral'&&c.conclusion!=='skipped').length)}catch{console.log(0)}})")

  echo "commit check-runs → Total: $TOTAL  Pending: $PENDING  Failed: $FAILED  (min required: $MIN_CHECKS)"

  if [ "$TOTAL" -ge "$MIN_CHECKS" ] && [ "$PENDING" -eq "0" ] && [ "$FAILED" -eq "0" ]; then
    echo "All CI checks passed!"
    rm -f "$START_FILE"
    echo '::kb-output::{"decision":"passed","hasLogs":false,"ciLogsFile":""}'
    exit 0
  fi

  if [ "$FAILED" -gt "0" ]; then
    echo "CI failed ($FAILED check(s) failed). Collecting logs..."
    # Find failed run via gh run list
    FAILED_RUN=$(gh run list --repo "$REPO_FULL" --branch "$BRANCH_NAME" \
      --json databaseId,conclusion --limit 5 2>/dev/null \
      | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{
          try{const rs=JSON.parse(d);const f=rs.find(r=>r.conclusion==='failure');console.log(f?f.databaseId:'')}catch{console.log('')}
        })")
    if [ -n "$FAILED_RUN" ]; then
      gh run view "$FAILED_RUN" --repo "$REPO_FULL" --log-failed 2>/dev/null | tail -300 > "$LOGS_FILE"
    else
      echo "Failed run ID not found." > "$LOGS_FILE"
    fi
    rm -f "$START_FILE"
    LOGS_JSON=$(node -e "console.log(JSON.stringify({decision:'fix_needed',hasLogs:true,ciLogsFile:process.argv[1]}))" "$LOGS_FILE")
    echo "::kb-output::$LOGS_JSON"
    exit 0
  fi

  # Still pending or not enough checks yet
  if [ "$PENDING" -gt "0" ]; then
    echo "CI still running ($PENDING pending)."
  else
    echo "No checks yet for this commit (total: $TOTAL, need: $MIN_CHECKS). Waiting for CI to start..."
  fi
  echo '::kb-output::{"decision":"pending","hasLogs":false,"ciLogsFile":""}'
  exit 0
fi

# --- Fallback: no SHA available, use gh run list ---
echo "SHA not available, falling back to gh run list..."
RUNS=$(gh run list --repo "$REPO_FULL" --branch "$BRANCH_NAME" \
  --json databaseId,status,conclusion --limit 5 2>/dev/null || echo '[]')

RUNS_PENDING=$(echo "$RUNS" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const rs=JSON.parse(d);console.log(rs.filter(r=>r.status==='in_progress'||r.status==='queued'||r.status==='waiting').length)}catch{console.log(0)}})")
RUNS_FAILED=$(echo "$RUNS"  | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const rs=JSON.parse(d);console.log(rs.filter(r=>r.conclusion==='failure').length)}catch{console.log(0)}})")
RUNS_TOTAL=$(echo "$RUNS"   | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d).length)}catch{console.log(0)}})")

echo "gh run list → Total: $RUNS_TOTAL  Pending: $RUNS_PENDING  Failed: $RUNS_FAILED"

if [ "$RUNS_TOTAL" = "0" ] || [ "$RUNS_PENDING" -gt "0" ]; then
  echo '::kb-output::{"decision":"pending","hasLogs":false,"ciLogsFile":""}'
  exit 0
fi

if [ "$RUNS_FAILED" = "0" ]; then
  rm -f "$START_FILE"
  echo '::kb-output::{"decision":"passed","hasLogs":false,"ciLogsFile":""}'
  exit 0
fi

FAILED_RUN=$(echo "$RUNS" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const rs=JSON.parse(d);const f=rs.find(r=>r.conclusion==='failure');console.log(f?f.databaseId:'')}catch{console.log('')}})")
[ -n "$FAILED_RUN" ] && gh run view "$FAILED_RUN" --repo "$REPO_FULL" --log-failed 2>/dev/null | tail -300 > "$LOGS_FILE"
rm -f "$START_FILE"
LOGS_JSON=$(node -e "console.log(JSON.stringify({decision:'fix_needed',hasLogs:true,ciLogsFile:process.argv[1]}))" "$LOGS_FILE")
echo "::kb-output::$LOGS_JSON"
