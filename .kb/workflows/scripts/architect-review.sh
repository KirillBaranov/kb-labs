#!/usr/bin/env bash
# Step: Architect Review
# Env: ISSUE_NUMBER, ISSUE_TITLE
set -e

# Run in the provisioned worktree (or project root when no worktree is used)
cd "${KB_WORKSPACE_ROOT:-$(pwd)}"

RESULT_FILE=$(mktemp)
ARTIFACTS_DIR=".kb/run-artifacts"
mkdir -p "$ARTIFACTS_DIR"

DIFF=$(git diff HEAD 2>/dev/null | head -500)
FILES=$(git diff --name-only HEAD 2>/dev/null)
PLAN=$(cat PLAN.md 2>/dev/null || echo "")

PROMPT="You are a senior software architect reviewing an implementation. Write in English.

IMPORTANT SECURITY RULE: Never quote, print, or include the literal value of any secret, token, password, or credential in your output — even if you find one in a file. Describe the problem (e.g. 'a live token is hardcoded') without revealing the value itself.

Issue #${ISSUE_NUMBER}: ${ISSUE_TITLE}

Implementation plan:
$PLAN

Changed files:
$FILES

Diff (first 500 lines):
$DIFF

Review the implementation for:
1. Architecture correctness — does it fit the existing patterns?
2. Abstractions — are new abstractions justified or over-engineered?
3. Coupling — does it introduce tight coupling or circular deps?
4. Naming — are names clear and consistent with codebase conventions?
5. Test coverage — are critical paths tested?
6. Edge cases — are obvious failure modes handled?

Output a structured Markdown review:

## Verdict
APPROVED | NEEDS_FIXES

## Summary
(2-3 sentences overall assessment)

## Findings
(list findings with severity: blocker / warning / suggestion)
Each finding: - [SEVERITY] description

## Conclusion
(what must be fixed before merge, if anything)

At the very end output exactly:
::kb-output::{\"verdict\":\"APPROVED\"|\"NEEDS_FIXES\",\"blockers_count\":N,\"review\":\"<first 300 chars of summary>\"}"

claude \
  -p "$PROMPT" \
  --output-format text \
  --model sonnet \
  --no-session-persistence \
  --dangerously-skip-permissions \
  > "$RESULT_FILE" 2>/dev/null </dev/null

REVIEW_TEXT=$(cat "$RESULT_FILE")
rm -f "$RESULT_FILE"

# Save to artifacts dir (reliable) and /tmp (legacy compat)
printf '%s' "$REVIEW_TEXT" > "${ARTIFACTS_DIR}/architect-review-${ISSUE_NUMBER}.md"
printf '%s' "$REVIEW_TEXT" > "/tmp/kb-architect-review-${ISSUE_NUMBER}.md"

echo "$REVIEW_TEXT"
