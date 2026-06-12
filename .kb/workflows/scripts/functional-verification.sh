#!/usr/bin/env bash
# Step: Functional Verification
# Env: ISSUE_NUMBER, ISSUE_TITLE, ISSUE_BODY
set -e

cd "${KB_WORKSPACE_ROOT:-$(pwd)}"

RESULT_FILE=$(mktemp)
ARTIFACTS_DIR=".kb/run-artifacts"
mkdir -p "$ARTIFACTS_DIR"

PLAN=$(cat PLAN.md 2>/dev/null || echo "")
CHANGED_FILES=$(git diff --name-only HEAD 2>/dev/null)

PROMPT="You are a QA engineer verifying that a feature actually works. Write everything in English.

IMPORTANT SECURITY RULE: Never quote, print, or include the literal value of any secret, token, password, or credential in your output — even if you find one in a file. Describe the problem without revealing the value.

Issue #${ISSUE_NUMBER}: ${ISSUE_TITLE}

Issue description:
${ISSUE_BODY}

Implementation plan:
${PLAN}

Changed files:
${CHANGED_FILES}

Working directory: $(pwd)

Your job: verify the feature works end-to-end by actually running it. Produce evidence (real command output) for each acceptance criterion.

Step 1 — Build changed packages
Run: kb-devkit run build --affected
If build fails: output FAILED and stop.

Step 2 — Derive acceptance criteria
Read the issue description and plan. Extract 3-6 concrete, testable acceptance criteria.
For each criterion, write the exact command(s) you will run to verify it.

Step 3 — Run each criterion
For each criterion:
1. Print the criterion
2. Print the exact command
3. Run the command
4. Print the actual output (full stdout, truncated to 500 chars if very long)
5. Mark: PASS / FAIL / SKIP (with reason for SKIP)

If a required service is not running, start it:
  /Users/kirillbaranov/Desktop/kb-labs-workspace/tools/kb-dev/kb-dev start --config .kb/devservices.dev.yaml 2>/dev/null

Step 4 — Output the report

Format:

## Functional Verification Report
**Issue**: #${ISSUE_NUMBER} — ${ISSUE_TITLE}

## Build
- Status: PASSED | FAILED

## Acceptance Criteria

### AC-1: <criterion text>
\`\`\`
$ <command>
<actual output>
\`\`\`
**Result**: PASS | FAIL | SKIP
**Notes**: (only if needed)

### AC-2: ...

## Verdict
PASSED | FAILED
**Summary**: (1-2 sentences — what works, what doesn't)

At the very end output exactly one line:
::kb-output::{\"verdict\":\"PASSED\"|\"FAILED\",\"criteria_total\":N,\"criteria_passed\":N}"

claude \
  -p "$PROMPT" \
  --output-format text \
  --model sonnet \
  --no-session-persistence \
  --dangerously-skip-permissions \
  > "$RESULT_FILE" 2>/dev/null </dev/null

REPORT=$(cat "$RESULT_FILE")
rm -f "$RESULT_FILE"

printf '%s' "$REPORT" > "${ARTIFACTS_DIR}/functional-verification-${ISSUE_NUMBER}.md"
echo "$REPORT"
