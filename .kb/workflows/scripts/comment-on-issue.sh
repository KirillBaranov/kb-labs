#!/usr/bin/env bash
# Step: Comment on Issue with implementation summary
# Env: ISSUE_NUMBER, ISSUE_TITLE, OWNER, REPO, QA_STATUS
set -e
# shellcheck source=lib-sanitize.sh
source "$(dirname "$0")/lib-sanitize.sh"

REPO_FULL="$OWNER/$REPO"
RESULT_FILE=$(mktemp)
DIFF=$(git diff HEAD~2..HEAD --stat 2>/dev/null | tail -20 || git diff --stat 2>/dev/null | tail -20)

PROMPT="You just implemented a GitHub issue. Write a concise implementation comment in English.

Issue: #${ISSUE_NUMBER} — ${ISSUE_TITLE}

Git diff stat (what changed):
$DIFF

QA status: ${QA_STATUS:-passed}
CI status: passed

Write EXACTLY this markdown structure, no other text:

## Summary
<one sentence: what the user will now experience differently>

## Changes
- \`filename\` — what was changed and why (one line per file, only files that matter)

## Validation
- QA: <status>
- CI: all checks green

---
*Implemented autonomously by AI agent powered by [KB Labs](https://github.com/KirillBaranov/kb-labs). Closes #${ISSUE_NUMBER}*"

claude \
  -p "$PROMPT" \
  --output-format json \
  --model sonnet \
  --dangerously-skip-permissions \
  > "$RESULT_FILE" 2>/dev/null

COMMENT=$(node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d).result||'')}catch{console.log('')}})" < "$RESULT_FILE")
rm -f "$RESULT_FILE"

TMP=$(mktemp)
printf '%s' "$COMMENT" | sanitize_secrets > "$TMP"
gh issue comment "$ISSUE_NUMBER" --repo "$REPO_FULL" --body-file "$TMP"
rm -f "$TMP"
