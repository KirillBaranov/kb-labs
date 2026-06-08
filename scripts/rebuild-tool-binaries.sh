#!/usr/bin/env bash
# Rebuild every committed Go tool binary (tools/<name>/<name>).
#
# The binaries are tracked in git so `pnpm build` / `pnpm dev:start` work without
# a Go toolchain. Run this after changing a tool's source, then commit the
# rebuilt binary — the `tool-binaries-fresh` check fails a PR that forgets to.
#
# Usage: pnpm tools:rebuild   (or: bash scripts/rebuild-tool-binaries.sh)

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
built=0

for dir in "$ROOT"/tools/*/; do
  name="$(basename "$dir")"
  mk="$dir/Makefile"
  [ -f "$mk" ] || continue
  # Only tools whose Makefile builds a binary named after the directory.
  grep -qE "^BINARY[[:space:]]*:?=[[:space:]]*$name\b" "$mk" || continue
  echo "==> building $name"
  make -C "$dir" build
  built=$((built + 1))
done

echo "==> Done: $built tool binaries rebuilt"
