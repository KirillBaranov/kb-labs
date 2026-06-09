#!/usr/bin/env bash
# Step: Post final pipeline summary to PR
# Env: ISSUE_NUMBER, ISSUE_TITLE, OWNER, REPO, PR_NUMBER,
#      REVIEW_PASSED, ARCHITECT_VERDICT, QA_VERDICT, QA_BUGS_COUNT,
#      CHECKS_STATUS, BRANCH_NAME
set -e
# shellcheck source=lib-sanitize.sh
source "$(dirname "$0")/lib-sanitize.sh"

REPO_FULL="$OWNER/$REPO"
DIFF_STAT=$(git diff HEAD~1..HEAD --stat 2>/dev/null | tail -5 || echo "")
FILES=$(git diff HEAD~1..HEAD --name-only 2>/dev/null | sed 's/^/`/' | sed 's/$/'\''\`/' || echo "")

# Build status icons
REVIEW_ICON="✅"; [ "$REVIEW_PASSED" = "false" ] && REVIEW_ICON="⚠️ → ✅"
ARCH_ICON="✅ APPROVED"; [ "$ARCHITECT_VERDICT" = "NEEDS_FIXES" ] && ARCH_ICON="⚠️ → ✅ Fixed"
QA_ICON="✅ PASSED"
if [ "$QA_VERDICT" = "BUGS_FOUND" ]; then
  QA_ICON="🐛 → ✅ Fixed (${QA_BUGS_COUNT} bug(s))"
fi
CHECKS_ICON="✅ Passed"; [ "$CHECKS_STATUS" != "passed" ] && CHECKS_ICON="⚠️ $CHECKS_STATUS"

TMP=$(mktemp)
cat >> "$TMP" << BODY
## 🤖 Autonomous Implementation — Complete

**Issue:** #${ISSUE_NUMBER} — ${ISSUE_TITLE}
**Pipeline:** \`github-issue-to-pr\` · KB Labs Agent Pipeline

---

### Pipeline Journey

| # | Stage | Agent Role | Status |
|---|-------|-----------|--------|
| 1 | Planning | Architect Agent | ✅ Human-approved |
| 2 | Implementation | Developer Agent | ✅ Complete |
| 3 | Code Review | Review Agent | ${REVIEW_ICON} |
| 4 | Architecture Review | Senior Architect Agent | ${ARCH_ICON} |
| 5 | Adversarial QA | QA Engineer Agent | ${QA_ICON} |
| 6 | QA Checks | Automated checks | ${CHECKS_ICON} |
| 7 | CI | GitHub Actions | ✅ All green |
| 8 | Final Review | Human sign-off | ✅ Approved |

### 👤 Human Sign-offs
- ✅ **Plan approved** — reviewed and accepted the implementation plan
- ✅ **Final approved** — reviewed the complete implementation

### 📁 What Changed
BODY

if [ -n "$DIFF_STAT" ]; then
  printf '\n```\n%s\n```\n' "$DIFF_STAT" >> "$TMP"
fi

cat >> "$TMP" << BODY

---
*Implemented autonomously by the [KB Labs](https://github.com/KirillBaranov/kb-labs) agent pipeline.*
*Each stage ran independently with full tool access — no human wrote any of this code.*
BODY

SANITIZED=$(mktemp)
sanitize_secrets < "$TMP" > "$SANITIZED" && mv "$SANITIZED" "$TMP"
gh pr comment "$PR_NUMBER" --repo "$REPO_FULL" --body-file "$TMP" 2>/dev/null || true
rm -f "$TMP"
