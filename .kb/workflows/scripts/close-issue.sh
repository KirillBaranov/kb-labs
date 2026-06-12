#!/usr/bin/env bash
# Step: Close Issue
# Env: ISSUE_NUMBER, OWNER, REPO, CLICKUP_TASK_ID (optional)
gh issue close "$ISSUE_NUMBER" --repo "$OWNER/$REPO" 2>/dev/null || true

if [ -n "$CLICKUP_TASK_ID" ]; then
  pnpm --silent kb clickup task update "$CLICKUP_TASK_ID" --status "complete" --yes 2>/dev/null || true
  echo "ClickUp task ${CLICKUP_TASK_ID} marked complete"
fi
