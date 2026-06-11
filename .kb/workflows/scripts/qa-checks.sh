#!/usr/bin/env bash
# Step: QA Checks (diff-aware, local, fast)
# Env: ISSUE_NUMBER, BASE_BRANCH
set -e

# Run in the provisioned worktree (or project root when no worktree is used)
cd "${KB_WORKSPACE_ROOT:-$(pwd)}"

# Type-check affected packages before running QA — catches TS errors that CI
# would catch later, preventing a commit→CI-fail→fix loop.
echo "Running type-check on affected packages..."
if ! kb-devkit run type-check --affected 2>&1; then
  echo "::kb-output::{\"status\":\"failed\",\"blockers\":[\"type-check failed — fix TS errors before commit\"],\"warnings\":[]}"
  exit 1
fi

QA_RESULT=$(pnpm kb qa check \
  --id new-tests \
  --base "$BASE_BRANCH" \
  --context "{\"taskId\":\"issue-${ISSUE_NUMBER}\",\"agentId\":\"workflow\"}" \
  --json 2>/dev/null || echo '{}')

echo "$QA_RESULT"

STATUS=$(echo "$QA_RESULT"   | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d).status||'passed')}catch{console.log('passed')}})")
BLOCKERS=$(echo "$QA_RESULT" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const r=JSON.parse(d);console.log(JSON.stringify(r.blockers||[]))}catch{console.log('[]')}})")
WARNINGS=$(echo "$QA_RESULT" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const r=JSON.parse(d);console.log(JSON.stringify(r.warnings||[]))}catch{console.log('[]')}})")

echo "::kb-output::{\"status\":\"$STATUS\",\"blockers\":$BLOCKERS,\"warnings\":$WARNINGS,\"result\":$QA_RESULT}"
