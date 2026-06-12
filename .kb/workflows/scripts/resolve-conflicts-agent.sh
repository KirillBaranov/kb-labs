#!/usr/bin/env bash
# Step: Agent Resolves Conflicts
# Called when resolve-conflicts.sh finds real code conflicts that require semantic understanding.
# The agent merges origin/{BASE_BRANCH}, resolves each conflict file, then commits and pushes.
#
# Env: CONFLICT_FILES (JSON array of conflicting file paths), BRANCH_NAME, BASE_BRANCH
set -e

cd "${KB_WORKSPACE_ROOT:-$(pwd)}"

RESULT_FILE=$(mktemp)

# Build a readable list of conflict files for the prompt
CONFLICT_LIST=$(echo "$CONFLICT_FILES" | node -e "
  let d=''; process.stdin.on('data',c=>d+=c).on('end',()=>{
    try { const files=JSON.parse(d); console.log(files.join('\n')); }
    catch(e) { console.log(d.trim()); }
  })")

PROMPT="You are working in a git repository. The branch you are on has merge conflicts with origin/${BASE_BRANCH}.

Working directory: $(pwd)
Branch: ${BRANCH_NAME}
Base: ${BASE_BRANCH}

Conflicting files:
${CONFLICT_LIST}

Your task:
1. Run: git fetch origin && git merge origin/${BASE_BRANCH} --no-edit
   (This will fail with conflicts — that is expected.)
2. For each conflicting file, open it and resolve all conflict markers (<<<<<<<, =======, >>>>>>>) by choosing the correct content. Prefer the incoming change (origin/${BASE_BRANCH}) for infrastructure/tooling files. Prefer HEAD for feature implementation files. Use judgment when both sides have meaningful changes — merge them semantically.
3. After resolving all files, run: git add <resolved-files>
4. Run: git merge --continue --no-edit  OR  git commit --no-edit
5. Run: git push origin HEAD:refs/heads/${BRANCH_NAME} --force
6. End with a summary of what you resolved and why.

IMPORTANT: Do NOT abort the merge. Resolve all conflicts and commit."

claude \
  -p "$PROMPT" \
  --output-format json \
  --model sonnet \
  --dangerously-skip-permissions \
  > "$RESULT_FILE" 2>&1 </dev/null

rm -f "$RESULT_FILE"

# Verify the merge is actually complete (no unresolved conflicts remain)
if git ls-files -u | grep -q .; then
  echo "ERROR: Agent left unresolved conflicts:"
  git ls-files -u | awk '{print $4}' | sort -u
  exit 1
fi

# If agent committed already, just push; otherwise commit what it staged
if git status | grep -q "nothing to commit"; then
  echo "Nothing to commit — agent already committed the merge."
  git push origin "HEAD:refs/heads/${BRANCH_NAME}" --force
else
  git add -A
  if ! git diff --cached --quiet; then
    git commit -m "fix: resolve merge conflicts with ${BASE_BRANCH}"
    git push origin "HEAD:refs/heads/${BRANCH_NAME}" --force
  else
    echo "No staged changes after agent run."
    # Merge may already be committed by agent
    git push origin "HEAD:refs/heads/${BRANCH_NAME}" --force
  fi
fi

echo "Conflicts resolved and pushed by agent."
echo '::kb-output::{"resolved":true}'
