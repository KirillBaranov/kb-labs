#!/usr/bin/env bash
# Step: Type Check — affected packages only
set -e

cd "${KB_WORKSPACE_ROOT:-$(pwd)}"

echo "Running type-check on affected packages..."
if ! kb-devkit run type-check --affected 2>&1; then
  echo "::kb-output::{\"passed\":false}"
  exit 1
fi

echo "Type-check passed."
echo "::kb-output::{\"passed\":true}"
