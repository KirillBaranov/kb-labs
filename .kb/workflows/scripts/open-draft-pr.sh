#!/usr/bin/env bash
# Step: Open Draft PR with Plan
# Env: ISSUE_NUMBER, ISSUE_TITLE, OWNER, REPO, BASE_BRANCH, BRANCH_NAME
#
# Idempotency: if a PR already exists for BRANCH_NAME, update its body instead of
# creating a duplicate. Reopens closed PRs. Cannot reopen merged PRs — creates new.
set -e

# Run in the provisioned worktree (same as agent-plans.sh) so PLAN.md is found there
cd "${KB_WORKSPACE_ROOT:-$(pwd)}"

REPO_FULL="$OWNER/$REPO"

git add -f PLAN.md
git commit -m "plan: implementation plan for issue #${ISSUE_NUMBER}" 2>/dev/null || true
git push origin "HEAD:refs/heads/${BRANCH_NAME}" --force

# Check if a PR already exists for this branch (open, closed, or merged)
EXISTING_PR=$(gh pr view "$BRANCH_NAME" \
  --repo "$REPO_FULL" \
  --json number,url,state 2>/dev/null || echo '{}')

EXISTING_STATE=$(echo "$EXISTING_PR" | node -e "
  let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{
    try { console.log(JSON.parse(d).state||''); } catch { console.log(''); }
  })")

if [ "$EXISTING_STATE" = "OPEN" ]; then
  PR_NUMBER=$(echo "$EXISTING_PR" | node -e "
    let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{
      try { console.log(JSON.parse(d).number||''); } catch { console.log(''); }
    })")
  gh pr edit "$PR_NUMBER" --repo "$REPO_FULL" --body-file PLAN.md 2>/dev/null || true
  echo "Updated existing open PR #${PR_NUMBER}"
elif [ "$EXISTING_STATE" = "CLOSED" ]; then
  PR_NUMBER=$(echo "$EXISTING_PR" | node -e "
    let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{
      try { console.log(JSON.parse(d).number||''); } catch { console.log(''); }
    })")
  gh pr reopen "$PR_NUMBER" --repo "$REPO_FULL" 2>/dev/null || true
  gh pr edit "$PR_NUMBER" --repo "$REPO_FULL" --body-file PLAN.md 2>/dev/null || true
  echo "Reopened and updated closed PR #${PR_NUMBER}"
else
  # No PR (or MERGED — need a fresh one after branch reset)
  gh pr create \
    --repo "$REPO_FULL" \
    --title "${ISSUE_TITLE}" \
    --body-file PLAN.md \
    --draft \
    --base "$BASE_BRANCH" \
    --head "$BRANCH_NAME" 2>/dev/null || true
fi

PR_JSON=$(gh pr view "$BRANCH_NAME" \
  --repo "$REPO_FULL" \
  --json number,url)
PR_URL=$(echo "$PR_JSON"    | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d).url)}catch{console.log('')}})")
PR_NUMBER=$(echo "$PR_JSON" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d).number)}catch{console.log('')}})")

echo "Draft PR: $PR_URL"
echo "::kb-output::{\"prUrl\":\"$PR_URL\",\"prNumber\":\"$PR_NUMBER\",\"url\":\"$PR_URL\"}"
