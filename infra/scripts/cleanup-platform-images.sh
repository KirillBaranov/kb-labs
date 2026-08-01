#!/usr/bin/env bash

set -euo pipefail

current_tag="${1:?usage: cleanup-platform-images.sh CURRENT_TAG [--apply] [SCOPE]}"
apply="${2:-}"
scope="${3:-release}"

if [[ "$apply" != "--apply" ]]; then
  echo "dry-run: pass --apply to remove old KB Labs platform image tags"
fi

repositories=(
  ghcr.io/kb-labs-team/kb-state-daemon
  ghcr.io/kb-labs-team/kb-marketplace-registry
  ghcr.io/kb-labs-team/kb-marketplace
  ghcr.io/kb-labs-team/kb-gateway
  ghcr.io/kb-labs-team/kb-rest-api
  ghcr.io/kb-labs-team/kb-workflow
  ghcr.io/kb-labs-team/kb-mcp
  ghcr.io/kb-labs-team/kb-studio
  ghcr.io/kb-labs-team/kb-consumer-gateway
  ghcr.io/kb-labs-team/kb-consumer-rest-api
  ghcr.io/kb-labs-team/kb-consumer-workflow
  ghcr.io/kb-labs-team/kb-consumer-marketplace-registry
)

for repository in "${repositories[@]}"; do
  previous_kept=false
  while IFS= read -r tag; do
    [[ -n "$tag" ]] || continue
    case "$scope" in
      release) [[ "$tag" =~ ^[0-9]+\.[0-9]+\.[0-9]+([.-].*)?$ ]] || continue ;;
      stage|dev) [[ "$tag" == "$scope-"* ]] || continue ;;
      *) echo "unsupported image scope: $scope" >&2; exit 1 ;;
    esac
    image="$repository:$tag"
    if [[ "$tag" == "$current_tag" || "$previous_kept" == false ]]; then
      echo "keep $image"
      if [[ "$tag" != "$current_tag" ]]; then
        previous_kept=true
      fi
      continue
    fi

    echo "remove $image"
    if [[ "$apply" == "--apply" ]]; then
      # A running container keeps its image, so Docker will refuse removal
      # rather than interrupting a service. Keep cleanup best-effort per tag.
      docker image rm "$image" >/dev/null || echo "skip (still in use): $image"
    fi
  done < <(
    docker image ls "$repository" --format '{{.CreatedAt}}|{{.Tag}}' |
      sort -r |
      cut -d'|' -f2 |
      awk 'NF && !seen[$0]++'
  )
done
