#!/usr/bin/env bash
# Resolve task source: fetch ClickUp task and create GitHub issue, or pass through ISSUE_NUMBER directly.
# Env: CLICKUP_TASK_ID (optional), ISSUE_NUMBER (optional), OWNER, REPO
set -e

if [ -n "$CLICKUP_TASK_ID" ]; then
  TASK_JSON=$(pnpm --silent kb clickup task get "$CLICKUP_TASK_ID" --json 2>/dev/null)

  TASK_NAME=$(echo "$TASK_JSON" | node -e "
    let d=''; process.stdin.on('data',c=>d+=c).on('end',()=>{
      try { console.log(JSON.parse(d).name) } catch { process.exit(1) }
    })")

  TASK_DESC=$(echo "$TASK_JSON" | node -e "
    let d=''; process.stdin.on('data',c=>d+=c).on('end',()=>{
      try { console.log(JSON.parse(d).description||'') } catch { console.log('') }
    })")

  TASK_URL=$(echo "$TASK_JSON" | node -e "
    let d=''; process.stdin.on('data',c=>d+=c).on('end',()=>{
      try { console.log(JSON.parse(d).url||'') } catch { console.log('') }
    })")

  ISSUE_BODY="${TASK_DESC}

---
_Source: [ClickUp ${CLICKUP_TASK_ID}](${TASK_URL})_"

  ISSUE_URL=$(gh issue create \
    --repo "$OWNER/$REPO" \
    --title "$TASK_NAME" \
    --body "$ISSUE_BODY")

  ISSUE_NUMBER=$(echo "$ISSUE_URL" | grep -oE '[0-9]+$')

  echo "GitHub issue #${ISSUE_NUMBER} created from ClickUp task ${CLICKUP_TASK_ID}"

  pnpm --silent kb clickup task update "$CLICKUP_TASK_ID" --status "in progress" --yes 2>/dev/null || true
fi

KB_OUTPUT=$(node -e "
const i='$ISSUE_NUMBER', c='$CLICKUP_TASK_ID';
process.stdout.write('::kb-output::' + JSON.stringify({issueNumber:i,clickupTaskId:c}) + '\n');
")
echo "$KB_OUTPUT"
