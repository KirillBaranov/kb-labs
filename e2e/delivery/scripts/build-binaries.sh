#!/usr/bin/env bash
# Cross-compile kb-create and kb-dev for linux/amd64 into ./bin so
# Dockerfile.target can COPY them. Run from e2e/delivery/.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
OUT="$HERE/bin"
mkdir -p "$OUT"

# Targets are always linux/amd64 — Dockerfile uses ubuntu:22.04 on amd64.
# (ARM hosts still produce amd64 binaries; Docker emulation handles the rest.)
export GOOS=linux
export GOARCH=amd64
export CGO_ENABLED=0

echo "building kb-create → $OUT/kb-create"
( cd "$REPO/tools/kb-create" && go build -trimpath -ldflags "-s -w" -o "$OUT/kb-create" . )

echo "building kb-deploy (host-side, native) → $OUT/kb-deploy-host"
(
  cd "$REPO/tools/kb-deploy"
  unset GOOS GOARCH
  CGO_ENABLED=0 go build -trimpath -ldflags "-s -w" -o "$OUT/kb-deploy-host" .
)

echo "done."
