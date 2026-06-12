#!/usr/bin/env bash
# Step: Post audit delta to PR — shows before/after for any review loop
# Env: AUDIT_TYPE, PREV_COUNT, CURR_COUNT, CURR_VERDICT, CURR_SUMMARY
set -e

cd "${KB_WORKSPACE_ROOT:-$(pwd)}"

PREV=${PREV_COUNT:-0}
CURR=${CURR_COUNT:-0}

if [ "$CURR_VERDICT" = "passed" ] || [ "$CURR" = "0" ]; then
  ICON="✅"
  STATUS="Resolved"
  DELTA="was ${PREV} → now **0**"
elif [ "$CURR_VERDICT" = "deadlock" ]; then
  ICON="🔴"
  STATUS="DEADLOCK — escalating to human"
  DELTA="was ${PREV} → still ${CURR} (agent made no progress)"
else
  ICON="🔄"
  STATUS="In progress"
  DELTA="was ${PREV} → now ${CURR}"
fi

BODY="## ${ICON} ${AUDIT_TYPE} Re-run — ${STATUS}

**Issues**: ${DELTA}

${CURR_SUMMARY}"

gh pr comment "$PR_NUMBER" --repo "$OWNER/$REPO" --body "$BODY" 2>/dev/null || true
