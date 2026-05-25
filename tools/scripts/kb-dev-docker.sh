#!/usr/bin/env bash
#
# kb-dev-docker.sh — `kb-dev` proxy that runs inside the platform container.
#
# Used by CI where the runner sits on the GH Actions host but the platform
# (and its kb-dev binary) lives in a sibling Docker container. Set this
# script as the runner's `KB_DEV_BIN` and the runner stays unaware of
# containers — it just calls `kb-dev`, the wrapper translates paths and
# forwards to the container.
#
# Path translation: any positional arg that starts with KB_HOST_E2E
# (default: `$GITHUB_WORKSPACE/e2e` or `$PWD/e2e`) is rewritten to start
# with KB_CONTAINER_E2E (default: `/workspace/e2e-host`). This matches the
# bind mount declared in `e2e/docker-compose.yml`.
#
# Environment:
#   KB_HOST_E2E         host path to repo's `e2e/` directory
#                       (default: `${GITHUB_WORKSPACE:-$PWD}/e2e`)
#   KB_CONTAINER_E2E    mount path inside the container
#                       (default: `/workspace/e2e-host`)
#   KB_CONTAINER_WORKDIR  workdir for `docker compose exec`
#                         (default: `/workspace/kb-e2e`)
#   KB_DOCKER_TARGET    docker compose service name (default: `platform`)

set -euo pipefail

# Repo root anchors path translation AND `docker compose` lookup. The runner
# is invoked from a per-domain CWD like `<repo>/e2e/gateway`; without
# rebasing we'd fail to locate `e2e/docker-compose.yml`.
REPO_ROOT="${GITHUB_WORKSPACE:-}"
if [[ -z "$REPO_ROOT" ]]; then
  # Fall back to walking up for the `.git` marker so the script is usable
  # outside GitHub Actions too.
  REPO_ROOT="$PWD"
  while [[ "$REPO_ROOT" != "/" && ! -e "$REPO_ROOT/.git" ]]; do
    REPO_ROOT="$(dirname "$REPO_ROOT")"
  done
fi

HOST_E2E="${KB_HOST_E2E:-$REPO_ROOT/e2e}"
CONTAINER_E2E="${KB_CONTAINER_E2E:-/workspace/e2e-host}"
CONTAINER_WORKDIR="${KB_CONTAINER_WORKDIR:-/workspace/kb-e2e}"
TARGET="${KB_DOCKER_TARGET:-platform}"

translated=()
for arg in "$@"; do
  if [[ "$arg" == "$HOST_E2E"/* ]]; then
    arg="$CONTAINER_E2E/${arg#$HOST_E2E/}"
  fi
  translated+=("$arg")
done

cd "$REPO_ROOT"
exec docker compose exec -T -w "$CONTAINER_WORKDIR" "$TARGET" kb-dev "${translated[@]}"
