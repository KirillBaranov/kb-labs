#!/usr/bin/env bash
# Quick CI status overview from the terminal.
#
# Usage:
#   ./scripts/ci-status.sh              # last main run for each workflow
#   ./scripts/ci-status.sh 7d           # summary for the last 7 days
#   ./scripts/ci-status.sh --budget     # estimated compute spend last 24h
#
# Reads via `gh api`. Requires `gh auth login` once.

set -eu

REPO="${KB_LABS_REPO:-KirillBaranov/kb-labs}"
MODE="${1:-latest}"

case "$MODE" in
  latest|"")
    echo "== Latest run per workflow on main =="
    echo
    gh api "/repos/${REPO}/actions/workflows" --jq '.workflows[] | select(.state == "active") | .id' | while read -r wf_id; do
      gh api "/repos/${REPO}/actions/workflows/${wf_id}/runs?per_page=1&branch=main" --jq '
        .workflow_runs[] | "\(.conclusion // .status)\t\(.name)\t\(.html_url)"' 2>/dev/null || true
    done | while IFS=$'\t' read -r status name url; do
      case "$status" in
        success)     icon='✅' ;;
        failure)     icon='❌' ;;
        in_progress) icon='🟡' ;;
        cancelled)   icon='⚪' ;;
        *)           icon='❓' ;;
      esac
      printf "  %s  %-30s %s\n" "$icon" "$name" "$url"
    done
    ;;

  --budget|24h)
    SINCE=$(date -v-1d -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d "1 day ago" +%Y-%m-%dT%H:%M:%SZ)
    echo "== Compute spend since $SINCE =="
    echo
    TMP=$(mktemp)
    gh api -X GET "/repos/${REPO}/actions/runs" -f per_page=100 -f "created=>=$SINCE" --paginate \
      --jq '.workflow_runs[] | select(.status == "completed") | {id: .id, name: .name}' > "$TMP"
    TOTAL=$(jq -s 'length' "$TMP")
    echo "Total completed runs: $TOTAL"
    echo
    jq -r '.id' "$TMP" | xargs -n 1 -P 8 -I {} sh -c '
      gh api "/repos/'"${REPO}"'/actions/runs/{}/jobs" --jq "[.jobs[] | select(.completed_at != null) | ((.completed_at | fromdateiso8601) - (.started_at | fromdateiso8601))] | add // 0" 2>/dev/null
    ' > "${TMP}.dur"
    paste -d'|' <(jq -r '.name' "$TMP") "${TMP}.dur" | \
      awk -F'|' '{ s[$1] += $2; c[$1]++ } END { for (n in s) printf "%-50s %4d runs  %6.0f min\n", n, c[n], s[n]/60 }' | \
      sort -k4 -n -r
    echo
    TOTAL_S=$(awk '{ s += $1 } END { print s+0 }' "${TMP}.dur")
    printf "Total: %d min (%.1f hours)\n" "$((TOTAL_S/60))" "$(echo "scale=1; $TOTAL_S / 3600" | bc)"
    rm -f "$TMP" "${TMP}.dur"
    ;;

  *d)
    DAYS="${MODE%d}"
    SINCE=$(date -v-"${DAYS}"d -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d "${DAYS} days ago" +%Y-%m-%dT%H:%M:%SZ)
    echo "== Last ${DAYS}d on main =="
    echo
    gh api -X GET "/repos/${REPO}/actions/runs" -f per_page=100 -f "created=>=$SINCE" --paginate \
      --jq '.workflow_runs[] | select(.head_branch == "main") | "\(.conclusion // .status)\t\(.name)\t\(.run_started_at)"' | \
      awk -F'\t' '{ k = $1 "|" $2; c[k]++ } END { for (k in c) { split(k, p, "|"); printf "  %s %3d  %s\n", (p[1] == "success" ? "✅" : p[1] == "failure" ? "❌" : "⚪"), c[k], p[2] } }' | \
      sort
    ;;

  *)
    echo "usage: $0 [latest|24h|--budget|<N>d]" >&2
    exit 2
    ;;
esac
