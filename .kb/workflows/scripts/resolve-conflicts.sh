#!/usr/bin/env bash
# Step: Resolve Conflicts
# Checks if PR has merge conflicts with base branch and auto-resolves them.
# Garbage runtime files (.kb/run-artifacts/, .kb/ai-review/, .kb/qa/snapshots/, .mimocode/)
# are untracked. Real code conflicts are left for the agent (exits with needs_agent=true).
#
# Env: OWNER, REPO, PR_NUMBER, BRANCH_NAME, BASE_BRANCH
set -e

REPO_FULL="$OWNER/$REPO"

# Check if PR is conflicting
MERGEABLE=$(gh pr view "$PR_NUMBER" --repo "$REPO_FULL" --json mergeable --jq '.mergeable' 2>/dev/null)
echo "PR #${PR_NUMBER} mergeable: ${MERGEABLE}"

if [ "$MERGEABLE" != "CONFLICTING" ]; then
  echo "No conflicts — skipping."
  echo '::kb-output::{"resolved":false,"needs_agent":false}'
  exit 0
fi

echo "Conflicts detected. Attempting auto-merge with origin/${BASE_BRANCH}..."

WS="${KB_WORKSPACE_ROOT:-$(pwd)}"
cd "$WS"

git fetch origin 2>&1

# Attempt merge
if git merge "origin/${BASE_BRANCH}" --no-edit 2>&1; then
  echo "Merge succeeded cleanly."
else
  echo "Merge has conflicts. Checking which files..."
  CONFLICT_FILES=$(git ls-files -u | awk '{print $4}' | sort -u)
  echo "Conflicting files:"
  echo "$CONFLICT_FILES"

  # Garbage file patterns — safe to untrack entirely
  GARBAGE_PATTERN="^\.kb/ai-review/|^\.kb/qa/snapshots/|^\.kb/run-artifacts/|^\.mimocode/"

  CODE_CONFLICTS=$(echo "$CONFLICT_FILES" | grep -vE "$GARBAGE_PATTERN" || true)

  if [ -n "$CODE_CONFLICTS" ]; then
    echo "Real code conflicts found — agent needed:"
    echo "$CODE_CONFLICTS"
    git merge --abort 2>/dev/null || true
    CONFLICTS_JSON=$(echo "$CODE_CONFLICTS" | node -e "
      let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{
        const files=d.trim().split('\n').filter(Boolean);
        console.log(JSON.stringify({resolved:false,needs_agent:true,conflicts:files}));
      })")
    echo "::kb-output::$CONFLICTS_JSON"
    exit 0
  fi

  # Only garbage conflicts — resolve by untracking them
  echo "Only garbage runtime files conflict — untracking..."
  echo "$CONFLICT_FILES" | grep -E "$GARBAGE_PATTERN" | while IFS= read -r f; do
    git rm --cached "$f" 2>/dev/null || true
  done

  # Verify no more conflicts
  REMAINING=$(git ls-files -u | wc -l | tr -d ' ')
  if [ "$REMAINING" -gt "0" ]; then
    echo "Unexpected conflicts remain after garbage cleanup."
    git merge --abort 2>/dev/null || true
    echo '::kb-output::{"resolved":false,"needs_agent":true,"conflicts":["unknown"]}'
    exit 0
  fi
fi

# Remove all tracked garbage files (gitignored but previously committed)
git rm --cached -r \
  ".kb/ai-review/" \
  ".kb/qa/snapshots/" \
  ".kb/run-artifacts/" \
  ".mimocode/" \
  2>/dev/null || true

# Commit the merge
if ! git diff --cached --quiet; then
  git commit --no-edit -m "chore: merge ${BASE_BRANCH}, remove garbage runtime artifacts" 2>&1
elif git status | grep -q "^M\|All conflicts fixed"; then
  git merge --continue --no-edit 2>&1 || true
fi

# Push
git push origin "HEAD:refs/heads/${BRANCH_NAME}" --force 2>&1
echo "Conflicts resolved and pushed."
echo '::kb-output::{"resolved":true,"needs_agent":false}'
