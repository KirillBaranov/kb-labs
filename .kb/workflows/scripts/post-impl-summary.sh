#!/usr/bin/env bash
# Step: Post Implementation Summary to PR
# Env: ISSUE_NUMBER, OWNER, REPO, PR_NUMBER, IMPL_SUMMARY
set -e

REPO_FULL="$OWNER/$REPO"
FILES=$(git diff HEAD --name-only 2>/dev/null | sed 's/^/- `/' | sed 's/$/$/' || echo "")
DIFF_STAT=$(git diff HEAD --stat 2>/dev/null | tail -1 || echo "")

TMP=$(mktemp)
cat > "$TMP" << 'BODY'
## ⚙️ Implementation
BODY

printf '\n%s\n' "$IMPL_SUMMARY" >> "$TMP"

if [ -n "$FILES" ]; then
  printf '\n**Changed files:**\n%s\n' "$FILES" >> "$TMP"
fi

if [ -n "$DIFF_STAT" ]; then
  printf '\n> %s\n' "$DIFF_STAT" >> "$TMP"
fi

printf '\n---\n*Developer Agent — implementation complete, awaiting review pipeline*\n' >> "$TMP"

gh pr comment "$PR_NUMBER" --repo "$REPO_FULL" --body-file "$TMP" 2>/dev/null || true
rm -f "$TMP"
