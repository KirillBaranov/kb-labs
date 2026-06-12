#!/usr/bin/env bash
# Step: Architect Review Re-run — re-check after agent fix, detect deadlock
set -e

cd "${KB_WORKSPACE_ROOT:-$(pwd)}"

RESULT_FILE=$(mktemp)
ARTIFACTS_DIR=".kb/run-artifacts"
mkdir -p "$ARTIFACTS_DIR"

PLAN=$(cat PLAN.md 2>/dev/null || echo "")
DIFF=$(git diff HEAD --stat 2>/dev/null)
FILES=$(git diff --name-only HEAD 2>/dev/null)

PROMPT="You are a senior architect re-checking a fix. Write in English.

Issue #${ISSUE_NUMBER}: ${ISSUE_TITLE}

Plan:
${PLAN}

Changed files:
${FILES}

Working directory: $(pwd)

Review the current state for architectural concerns: layer violations, wrong abstractions,
missing contracts, coupling issues, API design problems.
Focus on whether previously reported blockers have been resolved.

Be concise. End with exactly:
::kb-output::{\"verdict\":\"APPROVED\"|\"NEEDS_FIXES\",\"blockers_count\":N,\"summary\":\"<2-3 sentence summary>\"}"

claude \
  -p "$PROMPT" \
  --output-format text \
  --model sonnet \
  --no-session-persistence \
  --dangerously-skip-permissions \
  > "$RESULT_FILE" 2>/dev/null </dev/null

REVIEW_TEXT=$(cat "$RESULT_FILE")
rm -f "$RESULT_FILE"

VERDICT=$(echo "$REVIEW_TEXT" | grep -o '"verdict":"[^"]*"' | tail -1 | grep -o 'APPROVED\|NEEDS_FIXES' || echo "NEEDS_FIXES")
BLOCKERS_COUNT=$(echo "$REVIEW_TEXT" | grep -o '"blockers_count":[0-9]*' | tail -1 | grep -o '[0-9]*' || echo "0")
SUMMARY=$(echo "$REVIEW_TEXT" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const m=d.match(/\"summary\":\"([^\"]*)\"/);console.log(m?m[1]:'')})")

CURR_CODE_HASH=$(git diff HEAD 2>/dev/null | sha256sum | cut -d' ' -f1)
CURR_FINDINGS_HASH=$(echo "$BLOCKERS_COUNT:$VERDICT" | sha256sum | cut -d' ' -f1)

DECISION="still_issues"
if [ "$VERDICT" = "APPROVED" ] || [ "$BLOCKERS_COUNT" = "0" ]; then
  DECISION="passed"
elif [ -n "$PREV_CODE_HASH" ] && [ "$CURR_CODE_HASH" = "$PREV_CODE_HASH" ] && \
     [ -n "$PREV_FINDINGS_HASH" ] && [ "$CURR_FINDINGS_HASH" = "$PREV_FINDINGS_HASH" ]; then
  DECISION="deadlock"
  SUMMARY="DEADLOCK: agent produced identical code with identical architect findings. Human review required."
fi

printf '%s' "$REVIEW_TEXT" > "${ARTIFACTS_DIR}/architect-rerun-${ISSUE_NUMBER}.md"

echo "::kb-output::{\"decision\":\"$DECISION\",\"blockers_count\":\"$BLOCKERS_COUNT\",\"codeHash\":\"$CURR_CODE_HASH\",\"findingsHash\":\"$CURR_FINDINGS_HASH\",\"summary\":\"$SUMMARY\"}"
