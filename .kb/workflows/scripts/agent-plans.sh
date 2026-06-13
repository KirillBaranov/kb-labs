#!/usr/bin/env bash
# Step: Agent Plans
# Env: ISSUE_NUMBER, ISSUE_TITLE, ISSUE_BODY, PLAN_FEEDBACK
set -e

# Run in the provisioned worktree (or project root when no worktree is used)
cd "${KB_WORKSPACE_ROOT:-$(pwd)}"

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
    'First, study the codebase (git log, grep, read relevant files) and determine whether',
    'this issue is ALREADY FULLY IMPLEMENTED in the current codebase or commit history.',
    '',
    'Output format — two parts, no exceptions:',
    '',
    'PART 1 (first line only):',
    '  If already fully done: PIPELINE_STATUS: ALREADY_IMPLEMENTED',
    '  If work is needed:     PIPELINE_STATUS: NEEDS_IMPLEMENTATION',
    '',
    'PART 2 (remaining lines): The implementation plan in Markdown:',
    '',
    '## Summary',
    '(1-2 sentences what needs to be done, or "Already implemented — no action needed.")',
    '',
    '## Root cause / context',
    '(brief analysis)',
    '',
    '## Implementation steps',
    '(numbered list: file paths, what to add/change; or empty if already done)',
    '',
    '## Tests / verification',
    '(how to verify the fix works)',
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
    > "$RESULT_FILE" 2>/dev/null
  CLAUDE_EXIT=$?
  [ "$CLAUDE_EXIT" = "0" ] && CLAUDE_OK=1 && break
  echo "claude attempt $attempt failed (exit $CLAUDE_EXIT), retrying..."
  sleep 3
done
rm -f "$PROMPT_FILE"

if [ "$CLAUDE_OK" = "0" ]; then
  echo "claude failed after 3 attempts"
  exit 1
fi

SESSION_ID=$(node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d).session_id||'')}catch{console.log('')}})" < "$RESULT_FILE")
RAW_TEXT=$(node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d).result||'')}catch{console.log('')}})" < "$RESULT_FILE")
rm -f "$RESULT_FILE"

# Parse PIPELINE_STATUS from first line; strip it so PLAN.md contains only the Markdown.
TMP_RAW=$(mktemp)
printf '%s' "$RAW_TEXT" > "$TMP_RAW"

PARSE_RESULT=$(node -e "
  const raw   = require('fs').readFileSync(process.argv[1], 'utf8');
  const lines = raw.split('\n');
  const first = lines[0] || '';
  const alreadyImplemented = first.includes('ALREADY_IMPLEMENTED');
  // Strip the status line; keep the rest as the plan
  const plan = alreadyImplemented
    ? lines.slice(1).join('\n').replace(/^\n+/, '')
    : raw;
  process.stdout.write(JSON.stringify({ alreadyImplemented, plan }));
" "$TMP_RAW")
rm -f "$TMP_RAW"

ALREADY_IMPLEMENTED=$(echo "$PARSE_RESULT" | node -e "
  let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{
    try { console.log(JSON.parse(d).alreadyImplemented ? 'true' : 'false'); }
    catch { console.log('false'); }
  })")

PLAN_TEXT=$(echo "$PARSE_RESULT" | node -e "
  let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{
    try { console.log(JSON.parse(d).plan || ''); }
    catch { console.log(''); }
  })")

echo "$PLAN_TEXT" > PLAN.md
echo "=== PLAN ==="
cat PLAN.md
echo "Session: $SESSION_ID"
echo "Already implemented: $ALREADY_IMPLEMENTED"

# Serialize plan + sessionId + alreadyImplemented safely via node
TMP_PLAN=$(mktemp)
printf '%s' "$PLAN_TEXT" > "$TMP_PLAN"
OUTPUT_JSON=$(node -e "
  const plan               = require('fs').readFileSync(process.argv[1], 'utf8');
  const sessionId          = process.argv[2];
  const alreadyImplemented = process.argv[3];
  console.log(JSON.stringify({ sessionId, plan, alreadyImplemented }));
" "$TMP_PLAN" "$SESSION_ID" "$ALREADY_IMPLEMENTED")
rm -f "$TMP_PLAN"
printf '%s\n' "::kb-output::$OUTPUT_JSON"
