#!/usr/bin/env bash
# Step: Open Draft PR with Plan
# Env: ISSUE_NUMBER, ISSUE_TITLE, OWNER, REPO, BASE_BRANCH, BRANCH_NAME
set -e

# Run in the provisioned worktree (same as agent-plans.sh) so PLAN.md is found there
cd "${KB_WORKSPACE_ROOT:-$(pwd)}"

REPO_FULL="$OWNER/$REPO"

git add -f PLAN.md
git commit -m "plan: implementation plan for issue #${ISSUE_NUMBER}" 2>/dev/null || true
git push origin "HEAD:refs/heads/${BRANCH_NAME}" --force

gh pr create \
  --repo "$REPO_FULL" \
  --title "${ISSUE_TITLE}" \
  --body-file PLAN.md \
  --draft \
  --base "$BASE_BRANCH" \
  --head "$BRANCH_NAME" 2>/dev/null || true

PR_JSON=$(gh pr view "$BRANCH_NAME" \
  --repo "$REPO_FULL" \
  --json number,url)
PR_URL=$(echo "$PR_JSON"    | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d).url)}catch{console.log('')}})")
PR_NUMBER=$(echo "$PR_JSON" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d).number)}catch{console.log('')}})")

echo "Draft PR: $PR_URL"
echo "::kb-output::{\"prUrl\":\"$PR_URL\",\"prNumber\":\"$PR_NUMBER\",\"url\":\"$PR_URL\"}"
