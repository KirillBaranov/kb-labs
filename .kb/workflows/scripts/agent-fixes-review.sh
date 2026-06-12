#!/usr/bin/env bash
# Step: Agent Fixes Review Blockers
# Env: ISSUE_NUMBER, ISSUE_TITLE, REVIEW_ISSUES, IMPL_SESSION_ID
set -e

# Run in the provisioned worktree (or project root when no worktree is used)
cd "${KB_WORKSPACE_ROOT:-$(pwd)}"

RESULT_FILE=$(mktemp)

PROMPT="The AI code review found blocking issues in your implementation. Fix them now. Write in English.

Issue #${ISSUE_NUMBER}: ${ISSUE_TITLE}

Review findings:
${REVIEW_ISSUES}

Instructions:
1. Fix every blocker and high severity issue listed above.
2. Do NOT change anything unrelated to the findings.
3. After fixing, self-verify:
   - Run kb-devkit run build --affected to confirm it still compiles.
   - Run tests for affected packages to confirm nothing broke.
   - Only finish when you are confident the issues are resolved.
4. Do NOT commit — just fix the code.
End with a summary of what you fixed and how you confirmed the fixes work."

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
