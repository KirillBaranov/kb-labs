#!/usr/bin/env bash
# Step: Agent Implements
# Env: ISSUE_NUMBER, ISSUE_TITLE, IMPL_FEEDBACK, PLAN_SESSION_ID
set -e

# Run in the provisioned worktree (or project root when no worktree is used)
cd "${KB_WORKSPACE_ROOT:-$(pwd)}"

RESULT_FILE=$(mktemp)

if [ -n "$IMPL_FEEDBACK" ]; then
  PROMPT="The user reviewed the implementation and requested corrections. Write in English.

$IMPL_FEEDBACK

Working directory: $(pwd)

Look at git diff HEAD~1 to understand what was previously implemented.
Make the requested changes.
Do NOT commit — just make the changes.
End with a short summary (2-3 sentences) of what you changed."

  claude \
    -p "$PROMPT" \
    --output-format json \
    --model sonnet \
    --dangerously-skip-permissions \
    > "$RESULT_FILE" 2>&1 </dev/null
else
  PROMPT="The plan you created has been approved. Now implement it exactly as planned. Write summaries in English.

Working directory: $(pwd)

Instructions:
1. Follow your plan step by step — do not deviate.
2. Make all necessary code changes.
3. Do NOT commit — just make the changes.
4. End with a short summary (2-3 sentences) of what you changed."

  RESUME_FLAG=""
  [ -n "$PLAN_SESSION_ID" ] && RESUME_FLAG="--resume $PLAN_SESSION_ID"

  claude \
    -p "$PROMPT" \
    $RESUME_FLAG \
    --output-format json \
    --model sonnet \
    --dangerously-skip-permissions \
    > "$RESULT_FILE" 2>&1 </dev/null
fi

SUMMARY=$(node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d).result||'')}catch{console.log('')}})" < "$RESULT_FILE")
SESSION_ID=$(node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d).session_id||'')}catch{console.log('')}})" < "$RESULT_FILE")
rm -f "$RESULT_FILE"

# Output sessionId and summary
echo "::kb-output::{\"sessionId\":\"$SESSION_ID\"}"
TMP_S=$(mktemp)
printf '%s' "$SUMMARY" | tail -c 2000 > "$TMP_S"
SUMMARY_JSON=$(node -e "const s=require('fs').readFileSync(process.argv[1],'utf8');console.log(JSON.stringify({summary:s}))" "$TMP_S")
rm -f "$TMP_S"
printf '%s\n' "::kb-output::$SUMMARY_JSON"
