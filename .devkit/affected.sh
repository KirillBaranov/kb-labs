#!/usr/bin/env bash
# Emit one changed file path per line for kb-devkit `affected.strategy: command`.
#
# Local default: uncommitted changes vs HEAD (matches built-in "git" strategy).
# CI override:   set KB_DEVKIT_BASE_REF to a ref or range, e.g.
#   origin/main...HEAD       PR diff (three-dot = merge-base..HEAD)
#   HEAD~1                   last commit
#   ${{ github.event.before }}..${{ github.sha }}  push event range

set -euo pipefail

if [ -n "${KB_DEVKIT_BASE_REF:-}" ]; then
  git diff --name-only "${KB_DEVKIT_BASE_REF}"
else
  # Uncommitted + staged (same surface as the built-in git strategy).
  { git diff --name-only HEAD; git diff --name-only --cached; } | sort -u
fi
