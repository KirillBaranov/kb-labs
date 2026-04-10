---
name: tool-kb-devkit
description: kb-devkit Go binary — build/lint/test orchestrator with content-addressable caching
globs:
  - "tools/kb-devkit/**"
  - "devkit.yaml"
---

# kb-devkit — Workspace Orchestrator

Go binary for workspace orchestration: task execution with content-addressable caching, quality checks, config sync.

## Task Execution

```bash
kb-devkit run build                          # build all (topological order, cached)
kb-devkit run build --affected               # only changed + downstream
kb-devkit run build lint test                 # multiple tasks
kb-devkit run build --packages @kb-labs/core-types,@kb-labs/sdk
kb-devkit run build --no-cache               # bypass cache
kb-devkit run build --live                   # stream output (concurrency=1)
kb-devkit run build --concurrency 4          # limit parallelism
kb-devkit run build --json                   # JSON output
```

### How Caching Works

1. Hash all input files matching `inputs:` globs → SHA256 key
2. Cache hit → restore outputs in ~1ms, mark `cached`
3. Cache miss → run command → store outputs → write manifest
4. Cache location: `.kb/devkit/`
5. Each task has independent cache: `(taskName, package, inputHash)`

### --affected Detection

Uses `affected.strategy` from `devkit.yaml`:
- `git` — `git diff --name-only HEAD` from root (our default)
- `submodules` — walks `.gitmodules` (legacy, not used anymore)
- `command` — custom script

After finding changed packages, BFS expands through reverse dep graph.

## Quality Checks

```bash
kb-devkit check                    # check all packages against presets
kb-devkit check --package @kb-labs/core-types
kb-devkit check --json

kb-devkit fix                      # auto-fix violations
kb-devkit fix --dry-run            # preview fixes
kb-devkit fix --safe               # deterministic fixes only
kb-devkit fix --scaffold           # create missing files
```

## Workspace Health

```bash
kb-devkit stats                    # health score A–F, issue counts
kb-devkit stats --json
kb-devkit status                   # package table: name, category, issues
kb-devkit status --json
```

## Config Sync

```bash
kb-devkit sync --check             # report drift
kb-devkit sync --dry-run           # preview changes
kb-devkit sync                     # apply
```

## Other Commands

```bash
kb-devkit init                     # create starter devkit.yaml
kb-devkit watch --json             # stream violations on file save (JSONL)
kb-devkit gate                     # pre-commit gate (staged files only)
kb-devkit doctor --json            # environment diagnostics
```

## Configuration (devkit.yaml)

```yaml
schemaVersion: 2
extends: [builtin:kb-labs]        # built-in pack with KB Labs presets

workspace:
  packageManager: pnpm
  categories:
    ts-lib:
      match: ["core/*", "sdk/*", "cli/*", "shared/*", "plugins/*/*", ...]
      preset: node-lib
    ts-app:
      match: ["plugins/*/daemon", "plugins/*/server", ...]
      preset: node-app
    go-binary:
      match: ["tools/kb-dev", "tools/kb-devkit", "tools/kb-create"]
      preset: go-binary

affected:
  strategy: git                    # single repo, no submodules

tasks:
  build:
    - categories: [ts-lib, ts-app]
      command: tsup
      inputs: ["src/**", "tsup.config.ts", "tsconfig*.json"]
      outputs: ["dist/**"]
      deps: ["^build"]             # deps' build first
```

## Important

- **Always use `kb-devkit run build`** — never `pnpm -r run build` (DTS ordering)
- **`--affected` uses `git` strategy** — no submodules anymore
- Content-addressable cache: same file content across packages stored once
- `deps: ["^build"]` means "build my dependencies first"
- `deps: ["build"]` means "build myself first (for test after build)"
