#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

FILES=(
  # Install scripts
  tools/kb-dev/install.sh
  tools/kb-devkit/install.sh
  tools/kb-deploy/install.sh
  tools/kb-monitor/install.sh
  tools/kb-create/install.sh

  # Root scripts
  bootstrap.sh
  scripts/config-mode.sh
  scripts/fix-perms.sh
  scripts/gates/check-dist-exports.sh
  scripts/gates/check-pack-install.sh
  scripts/merge-coverage.sh

  # E2E
  e2e/platform/entrypoint.sh
  e2e/delivery/scripts/build-binaries.sh
  e2e/delivery/scripts/publish-fixtures.sh
  e2e/publisher/publish.sh
  e2e/scripts/pack-all.sh

  # Infra
  .devkit/affected.sh

  # Sites
  sites/web/dev-start.sh
)

for f in "${FILES[@]}"; do
  path="$ROOT/$f"
  if [ -f "$path" ]; then
    chmod +x "$path"
  fi
done

# Devkit bin/*.mjs (glob)
if [ -d "$ROOT/infra/devkit/bin" ]; then
  find "$ROOT/infra/devkit/bin" -name "*.mjs" -exec chmod +x {} +
fi

echo "✓ permissions fixed"
