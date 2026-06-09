#!/usr/bin/env bash
# Step: Update PR Description with final plan
# Env: ISSUE_NUMBER, OWNER, REPO, PR_NUMBER
set -e

REPO_FULL="$OWNER/$REPO"
PLAN_BODY=$(cat PLAN.md 2>/dev/null || echo "See commits for implementation details.")

TMP=$(mktemp)
printf '%s\n\n---\n*Implemented autonomously by an AI agent powered by [KB Labs](https://github.com/KirillBaranov/kb-labs). Closes #%s*' \
  "$PLAN_BODY" "$ISSUE_NUMBER" > "$TMP"
gh pr edit "$PR_NUMBER" --repo "$REPO_FULL" --body-file "$TMP"
rm -f "$TMP"
