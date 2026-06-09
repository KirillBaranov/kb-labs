#!/usr/bin/env bash
# Step: Close Issue
# Env: ISSUE_NUMBER, OWNER, REPO
gh issue close "$ISSUE_NUMBER" --repo "$OWNER/$REPO" 2>/dev/null || true
