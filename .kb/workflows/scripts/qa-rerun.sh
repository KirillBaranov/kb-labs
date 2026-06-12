#!/usr/bin/env bash
# Step: Adversarial QA Re-run — re-attack after agent fix, detect deadlock
set -e

cd "${KB_WORKSPACE_ROOT:-$(pwd)}"

RESULT_FILE=$(mktemp)
ARTIFACTS_DIR=".kb/run-artifacts"
mkdir -p "$ARTIFACTS_DIR"

PLAN=$(cat PLAN.md 2>/dev/null || echo "")
FILES=$(git diff --name-only HEAD 2>/dev/null)

PROMPT="You are an adversarial QA engineer re-testing a bug fix. Write in English.

IMPORTANT SECURITY RULE: Never quote or include the literal value of any secret, token, or credential in your output.

Issue #${ISSUE_NUMBER}: ${ISSUE_TITLE}

Changed files:
${FILES}

Working directory: $(pwd)

The agent has attempted to fix previously reported bugs. Re-run your attacks.
Start relevant services if needed: /Users/kirillbaranov/Desktop/kb-labs-workspace/tools/kb-dev/kb-dev start --config .kb/devservices.dev.yaml 2>/dev/null

Focus on:
1. Were the specific bugs from the previous report actually fixed?
2. Did the fix introduce any new bugs?
3. Any remaining attack vectors?

Be concise. End with exactly:
::kb-output::{\"verdict\":\"PASSED\"|\"BUGS_FOUND\",\"bugs_count\":N,\"summary\":\"<2-3 sentence summary>\"}"

claude \
  -p "$PROMPT" \
  --output-format text \
  --model sonnet \
  --no-session-persistence \
  --dangerously-skip-permissions \
  > "$RESULT_FILE" 2>/dev/null </dev/null

QA_TEXT=$(cat "$RESULT_FILE")
rm -f "$RESULT_FILE"

VERDICT=$(echo "$QA_TEXT" | grep -o '"verdict":"[^"]*"' | tail -1 | grep -o 'PASSED\|BUGS_FOUND' || echo "BUGS_FOUND")
BUGS_COUNT=$(echo "$QA_TEXT" | grep -o '"bugs_count":[0-9]*' | tail -1 | grep -o '[0-9]*' || echo "0")
SUMMARY=$(echo "$QA_TEXT" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const m=d.match(/\"summary\":\"([^\"]*)\"/);console.log(m?m[1]:'')})")

CURR_CODE_HASH=$(git diff HEAD 2>/dev/null | sha256sum | cut -d' ' -f1)
CURR_FINDINGS_HASH=$(echo "$BUGS_COUNT:$VERDICT" | sha256sum | cut -d' ' -f1)

DECISION="still_issues"
if [ "$VERDICT" = "PASSED" ] || [ "$BUGS_COUNT" = "0" ]; then
  DECISION="passed"
elif [ -n "$PREV_CODE_HASH" ] && [ "$CURR_CODE_HASH" = "$PREV_CODE_HASH" ] && \
     [ -n "$PREV_FINDINGS_HASH" ] && [ "$CURR_FINDINGS_HASH" = "$PREV_FINDINGS_HASH" ]; then
  DECISION="deadlock"
  SUMMARY="DEADLOCK: agent produced identical code with identical QA findings. Human review required."
fi

printf '%s' "$QA_TEXT" > "${ARTIFACTS_DIR}/qa-rerun-${ISSUE_NUMBER}.md"

KB_OUTPUT=$(node -e "
const d='$DECISION', b='$BUGS_COUNT', c='$CURR_CODE_HASH', f='$CURR_FINDINGS_HASH';
const s=require('fs').readFileSync('/dev/stdin','utf8');
process.stdout.write('::kb-output::' + JSON.stringify({decision:d,bugs_count:b,codeHash:c,findingsHash:f,summary:s.trim()}) + '\n');
" <<< "$SUMMARY")
echo "$KB_OUTPUT"
