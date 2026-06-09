#!/usr/bin/env bash
# Step: Agent Fixes Architect Blockers
# Env: ISSUE_NUMBER, ISSUE_TITLE, ARCHITECT_REVIEW, IMPL_SESSION_ID
set -e

RESULT_FILE=$(mktemp)

PROMPT="The architect reviewed your implementation and found blockers that must be fixed.

Issue #${ISSUE_NUMBER}: ${ISSUE_TITLE}

Architect findings:
${ARCHITECT_REVIEW}

Instructions:
1. Fix every blocker listed by the architect.
2. Do NOT change anything unrelated to the findings.
3. Do NOT commit — just fix the code.
4. End with a short summary of what you fixed."

RESUME_FLAG=""
[ -n "$IMPL_SESSION_ID" ] && RESUME_FLAG="--resume $IMPL_SESSION_ID"

claude \
  -p "$PROMPT" \
  $RESUME_FLAG \
  --output-format json \
  --model sonnet \
  --dangerously-skip-permissions \
  > "$RESULT_FILE" 2>&1 </dev/null

SUMMARY=$(node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d).result||'')}catch{console.log('')}})" < "$RESULT_FILE")
rm -f "$RESULT_FILE"
echo "$SUMMARY"
TMP_S=$(mktemp)
printf '%s' "$SUMMARY" | tail -c 2000 > "$TMP_S"
SUMMARY_JSON=$(node -e "const s=require('fs').readFileSync(process.argv[1],'utf8');console.log(JSON.stringify({summary:s}))" "$TMP_S")
rm -f "$TMP_S"
printf '%s\n' "::kb-output::$SUMMARY_JSON"
