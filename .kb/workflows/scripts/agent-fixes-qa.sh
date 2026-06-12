#!/usr/bin/env bash
# Step: Agent Fixes QA Bugs
# Env: ISSUE_NUMBER, ISSUE_TITLE, QA_REPORT, IMPL_SESSION_ID
set -e

# Run in the provisioned worktree (or project root when no worktree is used)
cd "${KB_WORKSPACE_ROOT:-$(pwd)}"

RESULT_FILE=$(mktemp)

PROMPT="The adversarial QA agent found bugs in your implementation. Fix them. Write in English.

Issue #${ISSUE_NUMBER}: ${ISSUE_TITLE}

QA findings:
${QA_REPORT}

Instructions:
1. Fix every bug marked critical or major.
2. Do NOT change anything unrelated to the findings.
3. After fixing, self-verify by reproducing the exact attack from the QA report:
   - Start relevant services if needed.
   - Run the exact commands from the QA report that triggered the bug.
   - Confirm the bug no longer reproduces.
   - Run tests for affected packages.
   - Only finish when you have personally confirmed the bugs are fixed.
4. Do NOT commit — just fix the code.
End with: what was broken, how you fixed it, and exact verification steps you ran."

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
