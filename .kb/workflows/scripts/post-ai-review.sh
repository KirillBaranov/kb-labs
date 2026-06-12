#!/usr/bin/env bash
# Step: Post AI Review findings to PR
set -e

cd "${KB_WORKSPACE_ROOT:-$(pwd)}"

if [ "$REVIEW_PASSED" = "true" ]; then
  BODY="## ✅ Code Review — Passed

No issues found. Implementation looks good."
else
  BODY="## 🔍 Code Review — ${REVIEW_ISSUES_COUNT} issue(s) found

${REVIEW_SUMMARY}

---
*Agent will address these issues and a re-run will confirm resolution.*"
fi

gh pr comment "$PR_NUMBER" --repo "$OWNER/$REPO" --body "$BODY" 2>/dev/null || true
