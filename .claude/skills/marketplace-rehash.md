---
name: marketplace-rehash
description: Fix stale integrity hashes in .kb/marketplace.lock after rebuilding local adapters — when initPlatform silently falls back to NoOp/MockLLM
globs:
  - ".kb/marketplace.lock"
  - "adapters/**"
  - "plugins/marketplace/**"
---

# marketplace rehash — Fix Stale Lock Hashes

Run when adapters or local packages were rebuilt and `initPlatform` is silently loading NoOp/MockLLM instead of real adapters.

## Root cause

`initPlatform` validates each entry in `.kb/marketplace.lock` by comparing the stored `integrity` hash against the current `package.json`. If they don't match, the entry is skipped — no error, just fallback to defaults.

This happens after:
- `pnpm build` / `kb-devkit run build` on any adapter
- Bumping a package version (changes `package.json`)
- Any edit to `package.json` fields

## Fix

```bash
pnpm kb marketplace rehash
# or, for scripting/agents (no pnpm echo/ELIFECYCLE noise around --json output):
dev-kb marketplace rehash
```

Reads `.kb/marketplace.lock`, recomputes SHA256 for every entry that has a `resolvedPath` (local packages), writes fresh hashes back. No server call, no scope resolution.

```bash
# With JSON output for scripting — use dev-kb, not `pnpm kb`, so parsers don't
# choke on the leading `$ node ...` echo or a trailing `ELIFECYCLE` line on failure.
dev-kb marketplace rehash --json
```

> Both `pnpm kb` and `dev-kb` run this repo's local build — never the global
> prod `kb` in `~/.local/bin`. See "Which `kb` binary to run" in the root
> `CLAUDE.md`.

## What it does NOT do

- Does not add or remove entries (use `kb marketplace sync` for that)
- Does not touch entries without `resolvedPath` (marketplace-downloaded packages)
- Does not require running services

## When rehash reports 0 updated but adapter still not loading

Check if the entry exists in the lock at all:

```bash
cat .kb/marketplace.lock | grep "@kb-labs/my-adapter"
```

If missing — run `kb marketplace sync` (requires marketplace service running) or add manually via `kb marketplace install`.

## Key files

- Command: `plugins/marketplace/entry/src/commands/rehash.ts`
- Lock I/O: `core/discovery/src/marketplace-lock.ts`
- Hash algorithm: `sha256-` + SHA256 of raw `package.json` bytes (matches `npm-source.ts:computeIntegrity`)
