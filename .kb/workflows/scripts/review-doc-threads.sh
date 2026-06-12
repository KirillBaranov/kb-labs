#!/usr/bin/env bash
# Step: Review open doc-bot inline threads on the PR.
# For each unresolved thread: agent reads the doc page + changed code,
# decides if an update is needed, applies it, then resolves the thread.
set -e

cd "${KB_WORKSPACE_ROOT:-$(pwd)}"

ARTIFACTS_DIR=".kb/run-artifacts"
mkdir -p "$ARTIFACTS_DIR"

# Fetch open review comments (inline threads) from docs-bot
THREADS_JSON=$(gh api "repos/${OWNER}/${REPO}/pulls/${PR_NUMBER}/comments" \
  --jq '[.[] | select(.body | startswith("📚")) | {id: .id, path: .path, body: .body}]' 2>/dev/null || echo "[]")

THREAD_COUNT=$(echo "$THREADS_JSON" | python3 -c "import json,sys; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "0")

if [ "$THREAD_COUNT" = "0" ]; then
  echo "No open doc threads to review."
  echo "::kb-output::{\"doc_threads_reviewed\":0,\"doc_threads_updated\":0}"
  exit 0
fi

echo "Found $THREAD_COUNT open doc thread(s). Reviewing..."

RESULT_FILE=$(mktemp)

CHANGED_FILES=$(git diff --name-only HEAD 2>/dev/null | head -30)
DIFF_STAT=$(git diff HEAD --stat 2>/dev/null | tail -3)

PROMPT="You are a technical writer reviewing documentation accuracy. Write in English.

Issue #${ISSUE_NUMBER}: ${ISSUE_TITLE}

## Changed files in this PR
${CHANGED_FILES}

## Change summary
${DIFF_STAT}

## Doc threads to review
${THREADS_JSON}

## Your task

For each thread above:
1. Read the referenced doc file in \`sites/web/apps/docs/content/\` (infer path from the doc slug)
2. Check if the recent code changes affect what the doc describes
3. If the doc needs updating: apply minimal, accurate edits to keep it current. Only change what's actually affected.
4. If the doc is still accurate: no changes needed.

After reviewing ALL threads, reply to each using the GitHub API:
\`\`\`
gh api repos/${OWNER}/${REPO}/pulls/comments/<comment_id>/replies -X POST -f body='<your reply>'
\`\`\`

Reply format:
- If doc updated: \"✅ Reviewed and updated: <1 sentence what changed>\"
- If doc still accurate: \"✅ Reviewed — no changes needed: <1 sentence why it's still accurate>\"

Then resolve each thread:
\`\`\`
gh api repos/${OWNER}/${REPO}/pulls/comments/<comment_id> -X PATCH -f resolved=true
\`\`\`

At the very end output exactly one line:
::kb-output::{\"doc_threads_reviewed\":N,\"doc_threads_updated\":N}"

claude \
  -p "$PROMPT" \
  --output-format text \
  --model sonnet \
  --no-session-persistence \
  --dangerously-skip-permissions \
  > "$RESULT_FILE" 2>/dev/null </dev/null

AGENT_OUTPUT=$(cat "$RESULT_FILE")
rm -f "$RESULT_FILE"

printf '%s' "$AGENT_OUTPUT" > "${ARTIFACTS_DIR}/doc-review-${ISSUE_NUMBER}.md"
echo "$AGENT_OUTPUT" | grep -v '^::kb-output::'

REVIEWED=$(echo "$AGENT_OUTPUT" | grep -o '"doc_threads_reviewed":[0-9]*' | tail -1 | grep -o '[0-9]*' || echo "$THREAD_COUNT")
UPDATED=$(echo "$AGENT_OUTPUT" | grep -o '"doc_threads_updated":[0-9]*' | tail -1 | grep -o '[0-9]*' || echo "0")

KB_OUTPUT=$(node -e "
const r='$REVIEWED', u='$UPDATED';
process.stdout.write('::kb-output::' + JSON.stringify({doc_threads_reviewed:r,doc_threads_updated:u}) + '\n');
")
echo "$KB_OUTPUT"
