#!/usr/bin/env bash
# Step: Post Functional Verification results to PR
set -e

cd "${KB_WORKSPACE_ROOT:-$(pwd)}"

if [ "$VERIFY_VERDICT" = "PASSED" ]; then
  ICON="✅"
  STATUS="PASSED"
else
  ICON="⚠️"
  STATUS="NEEDS REVIEW"
fi

REPORT="${VERIFY_REPORT:-$(cat ".kb/run-artifacts/functional-verification-${ISSUE_NUMBER}.md" 2>/dev/null)}"
[ -z "$REPORT" ] && REPORT="Report not available"

# Prepend verdict to PR title so it's visible in the PR list without opening
CURRENT_TITLE=$(gh pr view "$PR_NUMBER" --repo "$OWNER/$REPO" --json title --jq '.title' 2>/dev/null || echo "")
# Strip any existing verdict prefix before adding new one
CLEAN_TITLE=$(echo "$CURRENT_TITLE" | sed 's/^[✅⚠️] //')
gh pr edit "$PR_NUMBER" --repo "$OWNER/$REPO" --title "${ICON} ${CLEAN_TITLE}" 2>/dev/null || true

# Post verification report as PR comment
BODY="## ${ICON} Functional Verification — ${STATUS}

**Acceptance criteria**: ${VERIFY_CRITERIA_PASSED:-?}/${VERIFY_CRITERIA_TOTAL:-?} passed

${REPORT}"

gh pr comment "$PR_NUMBER" --repo "$OWNER/$REPO" --body "$BODY" 2>/dev/null || true
