#!/usr/bin/env bash
# Resolve task source: fetch ClickUp task and create GitHub issue, or pass through ISSUE_NUMBER directly.
# Env: CLICKUP_TASK_ID (optional), ISSUE_NUMBER (optional), OWNER, REPO
#
# Idempotency: when CLICKUP_TASK_ID is given, search for an existing issue that references
# it in the body before creating a new one. Prevents duplicate issues/branches/PRs on re-runs.
set -e

ALREADY_DONE="false"

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

  # Search for an existing issue that references this ClickUp task in its body.
  # Checks open issues first, then closed — avoids creating duplicates on re-runs.
  SEARCH_JSON=$(gh issue list \
    --repo "$OWNER/$REPO" \
    --state all \
    --search "\"ClickUp ${CLICKUP_TASK_ID}\" in:body" \
    --json number,state \
    --limit 10 2>/dev/null || echo '[]')

  EXISTING=$(echo "$SEARCH_JSON" | node -e "
    let d=''; process.stdin.on('data',c=>d+=c).on('end',()=>{
      try {
        const issues = JSON.parse(d);
        const open   = issues.find(i => i.state === 'OPEN');
        const closed = issues.find(i => i.state === 'CLOSED');
        if (open)   { console.log(open.number + ':open'); }
        else if (closed) { console.log(closed.number + ':closed'); }
        else        { console.log(''); }
      } catch { console.log(''); }
    })")

  if [ -n "$EXISTING" ]; then
    EXISTING_STATE=$(echo "$EXISTING" | cut -d: -f2)
    ISSUE_NUMBER=$(echo "$EXISTING" | cut -d: -f1)

    if [ "$EXISTING_STATE" = "closed" ]; then
      echo "Issue #${ISSUE_NUMBER} for ClickUp task ${CLICKUP_TASK_ID} is already closed — task done."
      ALREADY_DONE="true"
    else
      echo "Reusing existing open issue #${ISSUE_NUMBER} for ClickUp task ${CLICKUP_TASK_ID}"
    fi
  else
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
fi

KB_OUTPUT=$(node -e "
const i='$ISSUE_NUMBER', c='$CLICKUP_TASK_ID', d='$ALREADY_DONE';
process.stdout.write('::kb-output::' + JSON.stringify({issueNumber:i,clickupTaskId:c,alreadyDone:d}) + '\n');
")
echo "$KB_OUTPUT"
