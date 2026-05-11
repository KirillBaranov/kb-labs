#!/usr/bin/env bash
# Switch kb.config.json between dev and prod modes.
# dev  — removes platform.dir (workspace packages, full adapters)
# prod — adds platform.dir pointing to installed kb-platform

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG="$REPO_ROOT/.kb/kb.config.json"
PROD_DIR="/Users/kirillbaranov/kb-platform"

mode="${1:-}"

if [[ "$mode" != "dev" && "$mode" != "prod" ]]; then
  echo "Usage: $0 <dev|prod>" >&2
  exit 1
fi

if [[ ! -f "$CONFIG" ]]; then
  echo "Config not found: $CONFIG" >&2
  exit 1
fi

if [[ "$mode" == "dev" ]]; then
  node -e "
    const fs = require('fs');
    const cfg = JSON.parse(fs.readFileSync('$CONFIG', 'utf8'));
    delete cfg.platform.dir;
    fs.writeFileSync('$CONFIG', JSON.stringify(cfg, null, 2) + '\n');
  "
  echo "✓ Dev mode: platform.dir removed"
else
  node -e "
    const fs = require('fs');
    const cfg = JSON.parse(fs.readFileSync('$CONFIG', 'utf8'));
    cfg.platform = { dir: '$PROD_DIR', ...cfg.platform };
    fs.writeFileSync('$CONFIG', JSON.stringify(cfg, null, 2) + '\n');
  "
  echo "✓ Prod mode: platform.dir = $PROD_DIR"
fi
