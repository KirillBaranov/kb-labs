#!/usr/bin/env bash
# Step: Commit and Push
# Env: ISSUE_NUMBER, ISSUE_TITLE, BRANCH_NAME, IMPL_FEEDBACK
set -e

# Run in the provisioned worktree (or project root when no worktree is used)
cd "${KB_WORKSPACE_ROOT:-$(pwd)}"

git add -A

if git diff --cached --quiet; then
  echo "No changes to commit."
  echo "::kb-output::{\"committed\":false}"
  exit 0
fi

if [ -n "$IMPL_FEEDBACK" ]; then
  COMMIT_MSG="fix: address review feedback for issue #${ISSUE_NUMBER}"
else
  COMMIT_MSG="feat: implement issue #${ISSUE_NUMBER} — ${ISSUE_TITLE}

Closes #${ISSUE_NUMBER}"
fi

git commit -m "$COMMIT_MSG"
git push origin "HEAD:refs/heads/${BRANCH_NAME}" --force
echo "::kb-output::{\"committed\":true}"
