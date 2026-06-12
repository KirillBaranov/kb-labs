#!/usr/bin/env bash
# Step: Commit and Push
# Env: ISSUE_NUMBER, ISSUE_TITLE, BRANCH_NAME
set -e

cd "${KB_WORKSPACE_ROOT:-$(pwd)}"

git add -A

if git diff --cached --quiet; then
  echo "No changes to commit."
  echo "::kb-output::{\"committed\":false}"
  exit 0
fi

# Use the commit plugin to generate a meaningful conventional commit message
# from the actual diff, instead of a generic hardcoded message.
pnpm kb commit commit --yes 2>/dev/null

git push origin "HEAD:refs/heads/${BRANCH_NAME}" --force
echo "::kb-output::{\"committed\":true}"
