#!/usr/bin/env bash
# Step: Agent Plans
# Env: ISSUE_NUMBER, ISSUE_TITLE, ISSUE_BODY, PLAN_FEEDBACK
set -e

RESULT_FILE=$(mktemp)
PROMPT_FILE=$(mktemp)

# Build prompt via node so special chars in issue body/title don't break shell
node -e "
  const body     = process.env.ISSUE_BODY     || '';
  const title    = process.env.ISSUE_TITLE    || '';
  const num      = process.env.ISSUE_NUMBER   || '';
  const feedback = process.env.PLAN_FEEDBACK  || '';

  const feedbackSection = feedback
    ? 'User feedback on previous plan (incorporate this):\n' + feedback
    : '';

  const prompt = [
    'You are a senior engineer planning implementation of a GitHub issue. Write in English.',
    '',
    'Issue #' + num + ': ' + title,
    '',
    'Description:',
    body,
    '',
    feedbackSection,
    'Study the codebase and produce a detailed implementation plan in Markdown:',
    '',
    '## Summary',
    '(1-2 sentences what needs to be done)',
    '',
    '## Root cause / context',
    '(brief analysis)',
    '',
    '## Implementation steps',
    '(numbered list: file paths, what to add/change, what to create)',
    '',
    '## Tests / verification',
    '(how to verify the fix works)',
    '',
    'Output ONLY the Markdown plan.',
  ].join('\n');

  require('fs').writeFileSync(process.argv[1], prompt);
" "$PROMPT_FILE"

# claude may exit 1 on first invocation in daemon context (init/warmup race) — retry
CLAUDE_OK=0
for attempt in 1 2 3; do
  claude \
    --output-format json \
    --model sonnet \
    --dangerously-skip-permissions \
    < "$PROMPT_FILE" \
    > "$RESULT_FILE" 2>/dev/null && CLAUDE_OK=1 && break
  echo "claude attempt $attempt failed, retrying..."
  sleep 3
done
rm -f "$PROMPT_FILE"

if [ "$CLAUDE_OK" = "0" ]; then
  echo "claude failed after 3 attempts"
  exit 1
fi

SESSION_ID=$(node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d).session_id||'')}catch{console.log('')}})" < "$RESULT_FILE")
PLAN_TEXT=$(node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d).result||'')}catch{console.log('')}})" < "$RESULT_FILE")
rm -f "$RESULT_FILE"

echo "$PLAN_TEXT" > PLAN.md
echo "=== PLAN ==="
cat PLAN.md
echo "Session: $SESSION_ID"

# Serialize plan + sessionId safely via node (plan may contain newlines/quotes)
TMP_PLAN=$(mktemp)
printf '%s' "$PLAN_TEXT" > "$TMP_PLAN"
OUTPUT_JSON=$(node -e "
  const plan      = require('fs').readFileSync(process.argv[1], 'utf8');
  const sessionId = process.argv[2];
  console.log(JSON.stringify({ sessionId, plan }));
" "$TMP_PLAN" "$SESSION_ID")
rm -f "$TMP_PLAN"
printf '%s\n' "::kb-output::$OUTPUT_JSON"
