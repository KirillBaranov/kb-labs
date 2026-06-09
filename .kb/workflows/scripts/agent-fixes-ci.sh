#!/usr/bin/env bash
# Step: Agent Fixes CI Failures
# Env: ISSUE_NUMBER, BRANCH_NAME, IMPL_SESSION_ID, CI_LOGS_FILE
set -e

# Run in the provisioned worktree (or project root when no worktree is used)
cd "${KB_WORKSPACE_ROOT:-$(pwd)}"

RESULT_FILE=$(mktemp)

RESUME_FLAG=""
[ -n "$IMPL_SESSION_ID" ] && RESUME_FLAG="--resume $IMPL_SESSION_ID"

PROMPT="GitHub CI failed on your implementation. You must fix it.

Working directory: $(pwd)

Your changes in this PR:
$(git diff HEAD~1 --stat 2>/dev/null || git diff --stat 2>/dev/null)

CI failure logs:
$(cat "$CI_LOGS_FILE")

Instructions:
1. Read the logs carefully — identify the exact file and line that failed.
2. Cross-reference with your changes (git diff HEAD~1 shows what you added).
3. For detailed logs: gh run list --repo ${OWNER}/${REPO} --branch ${BRANCH_NAME} --limit 5
   Then: gh run view <id> --repo ${OWNER}/${REPO} --log-failed
4. Fix the root cause. Do NOT suppress errors with eslint-disable or @ts-ignore.
5. Do NOT commit — just fix the code.
6. End with: what failed, what you changed to fix it."

claude \
  -p "$PROMPT" \
  $RESUME_FLAG \
  --output-format json \
  --model sonnet \
  --dangerously-skip-permissions \
  > "$RESULT_FILE" 2>&1 </dev/null

rm -f "$RESULT_FILE"

# Commit fixes and push
git add -A
if ! git diff --cached --quiet; then
  git commit -m "fix: CI failures for issue #${ISSUE_NUMBER}"
  git push origin "HEAD:refs/heads/${BRANCH_NAME}" --force
else
  echo "No changes from CI fix agent."
fi
