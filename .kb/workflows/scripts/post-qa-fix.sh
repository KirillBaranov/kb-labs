#!/usr/bin/env bash
# Step: Post QA Findings → Fixes summary to PR
# Only runs when adversarial QA found bugs and agent fixed them.
# Env: ISSUE_NUMBER, OWNER, REPO, PR_NUMBER, QA_FIX_SUMMARY
set -e

REPO_FULL="$OWNER/$REPO"
QA_FINDINGS=$(cat ".kb/run-artifacts/qa-report-${ISSUE_NUMBER}.md" 2>/dev/null | \
  grep -A 100 '## Findings' | head -40 || echo "")

TMP=$(mktemp)
cat > "$TMP" << 'BODY'
## 🔴 QA Findings → Fixed
BODY

if [ -n "$QA_FINDINGS" ]; then
  printf '\n**Bugs found by adversarial QA:**\n\n%s\n' "$QA_FINDINGS" >> "$TMP"
fi

printf '\n**Fixed by developer agent:**\n\n%s\n' "$QA_FIX_SUMMARY" >> "$TMP"
printf '\n---\n*Developer Agent — addressed all QA findings*\n' >> "$TMP"

gh pr comment "$PR_NUMBER" --repo "$REPO_FULL" --body-file "$TMP" 2>/dev/null || true
rm -f "$TMP"
