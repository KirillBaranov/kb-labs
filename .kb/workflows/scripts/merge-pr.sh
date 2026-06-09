#!/usr/bin/env bash
# Step: Merge PR
# Env: ISSUE_NUMBER, ISSUE_TITLE, OWNER, REPO, PR_NUMBER
set -e

gh pr merge "$PR_NUMBER" \
  --repo "$OWNER/$REPO" \
  --squash \
  --delete-branch \
  --subject "feat: ${ISSUE_TITLE} (#${ISSUE_NUMBER})"
