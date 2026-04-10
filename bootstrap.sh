#!/usr/bin/env bash
set -euo pipefail

# Builds all Go tools required to work in this monorepo.
# Run once after cloning: ./bootstrap.sh

cd "$(dirname "$0")"  # always run from repo root regardless of cwd

TOOLS=(kb-devkit kb-dev kb-deploy kb-monitor)

echo "→ Building Go tools..."
for tool in "${TOOLS[@]}"; do
  printf "  %-12s" "$tool"
  make -C "tools/$tool" build --quiet 2>&1
  echo "ok"
done

echo "→ Done. Tools available at tools/{kb-devkit,kb-dev,kb-deploy,kb-monitor}/"
