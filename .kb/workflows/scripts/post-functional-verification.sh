#!/usr/bin/env bash
# Step: Post Functional Verification results to PR
set -e

cd "${KB_WORKSPACE_ROOT:-$(pwd)}"

if [ "$VERIFY_VERDICT" = "PASSED" ]; then
  ICON="✅"
  STATUS="PASSED"
else
  ICON="❌"
  STATUS="FAILED"
fi

BODY="## ${ICON} Functional Verification — ${STATUS}

**Acceptance criteria**: ${VERIFY_CRITERIA_PASSED}/${VERIFY_CRITERIA_TOTAL} passed

${VERIFY_REPORT}"

gh pr comment "$PR_NUMBER" --repo "$OWNER/$REPO" --body "$BODY" 2>/dev/null || true
