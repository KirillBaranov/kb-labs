#!/usr/bin/env bash
# Step: AI Review Re-run — re-run review after agent fix, detect deadlock
set -e

cd "${KB_WORKSPACE_ROOT:-$(pwd)}"

RESULT_FILE=$(mktemp)
ARTIFACTS_DIR=".kb/run-artifacts"
mkdir -p "$ARTIFACTS_DIR"

DIFF=$(git diff HEAD --stat 2>/dev/null)
FILES=$(git diff --name-only HEAD 2>/dev/null)

PROMPT="You are a code reviewer re-checking a fix. Write in English.

Issue #${ISSUE_NUMBER}: ${ISSUE_TITLE}

The agent has made fixes based on previous review feedback.

Changed files:
${FILES}

Diff stat:
${DIFF}

Working directory: $(pwd)

Review the current implementation for correctness, completeness, and code quality.
Focus on whether the previously reported issues have been resolved.

Output a short review and end with exactly:
::kb-output::{\"passed\":true|false,\"issues_count\":N,\"issues\":\"<one-line summary of remaining issues or empty>\",\"summary\":\"<2-3 sentence summary>\"}"

claude \
  -p "$PROMPT" \
  --output-format text \
  --model sonnet \
  --no-session-persistence \
  --dangerously-skip-permissions \
  > "$RESULT_FILE" 2>/dev/null </dev/null

REVIEW_TEXT=$(cat "$RESULT_FILE")
rm -f "$RESULT_FILE"

# Extract structured output
PASSED=$(echo "$REVIEW_TEXT" | grep -o '"passed":[^,}]*' | tail -1 | grep -o 'true\|false' || echo "false")
ISSUES_COUNT=$(echo "$REVIEW_TEXT" | grep -o '"issues_count":[0-9]*' | tail -1 | grep -o '[0-9]*' || echo "0")
ISSUES=$(echo "$REVIEW_TEXT" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const m=d.match(/\"issues\":\"([^\"]*)\"/);console.log(m?m[1]:'')})")
SUMMARY=$(echo "$REVIEW_TEXT" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const m=d.match(/\"summary\":\"([^\"]*)\"/);console.log(m?m[1]:'')})")

# Compute hashes for deadlock detection
CURR_CODE_HASH=$(git diff HEAD 2>/dev/null | sha256sum | cut -d' ' -f1)
CURR_FINDINGS_HASH=$(echo "$ISSUES_COUNT:$ISSUES" | sha256sum | cut -d' ' -f1)

# Detect deadlock: same code + same findings as previous iteration
DECISION="still_issues"
if [ "$PASSED" = "true" ] || [ "$ISSUES_COUNT" = "0" ]; then
  DECISION="passed"
elif [ -n "$PREV_CODE_HASH" ] && [ "$CURR_CODE_HASH" = "$PREV_CODE_HASH" ] && \
     [ -n "$PREV_FINDINGS_HASH" ] && [ "$CURR_FINDINGS_HASH" = "$PREV_FINDINGS_HASH" ]; then
  DECISION="deadlock"
  SUMMARY="DEADLOCK: agent produced identical code with identical findings. Human review required."
fi

printf '%s' "$REVIEW_TEXT" > "${ARTIFACTS_DIR}/review-rerun-${ISSUE_NUMBER}.md"

echo "::kb-output::{\"decision\":\"$DECISION\",\"issues_count\":\"$ISSUES_COUNT\",\"codeHash\":\"$CURR_CODE_HASH\",\"findingsHash\":\"$CURR_FINDINGS_HASH\",\"summary\":\"$SUMMARY\"}"
