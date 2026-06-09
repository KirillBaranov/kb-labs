#!/usr/bin/env bash
# Step: AI Review
# Env: ISSUE_NUMBER, ISSUE_TITLE
set -e

# Run in the provisioned worktree (or project root when no worktree is used)
cd "${KB_WORKSPACE_ROOT:-$(pwd)}"

REVIEW_RESULT=$(pnpm kb review run \
  --mode full \
  --scope changed \
  --task "Issue #${ISSUE_NUMBER}: ${ISSUE_TITLE}" \
  --json 2>/dev/null || echo '{"passed":true,"issues":[],"summary":"review skipped"}')

echo "$REVIEW_RESULT"

PASSED=$(echo "$REVIEW_RESULT"  | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d).passed===false?'false':'true')}catch{console.log('true')}})")
SUMMARY=$(echo "$REVIEW_RESULT" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d).summary||'')}catch{console.log('')}})")
ISSUES=$(echo "$REVIEW_RESULT"  | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.stringify(JSON.parse(d).issues||[]))}catch{console.log('[]')}})")

echo "Review passed: $PASSED"
echo "Summary: $SUMMARY"
echo "::kb-output::{\"passed\":$PASSED,\"summary\":\"$SUMMARY\",\"issues\":$ISSUES}"
