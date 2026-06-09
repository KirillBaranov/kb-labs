#!/usr/bin/env bash
# Step: Post Architect Review → Fixes summary to PR
# Only runs when architect found blockers and agent fixed them.
# Env: ISSUE_NUMBER, OWNER, REPO, PR_NUMBER, ARCHITECT_FIX_SUMMARY
set -e

REPO_FULL="$OWNER/$REPO"
REVIEW=$(cat ".kb/run-artifacts/architect-review-${ISSUE_NUMBER}.md" 2>/dev/null | \
  grep -A 50 '## Findings' | head -30 || echo "")

TMP=$(mktemp)
cat > "$TMP" << 'BODY'
## 🏛️ Architecture Review → Addressed
BODY

if [ -n "$REVIEW" ]; then
  printf '\n**Architect findings:**\n\n```\n%s\n```\n' "$REVIEW" >> "$TMP"
fi

printf '\n**Fixed by developer agent:**\n\n%s\n' "$ARCHITECT_FIX_SUMMARY" >> "$TMP"
printf '\n---\n*Developer Agent — addressed all architecture blockers*\n' >> "$TMP"

gh pr comment "$PR_NUMBER" --repo "$REPO_FULL" --body-file "$TMP" 2>/dev/null || true
rm -f "$TMP"
