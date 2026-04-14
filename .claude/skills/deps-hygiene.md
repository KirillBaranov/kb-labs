---
name: deps-hygiene
description: Single Version Policy for external dependencies across the monorepo — enforced by syncpack
globs:
  - "**/package.json"
  - ".syncpackrc.json"
---

# Dependency Hygiene (Single Version Policy)

This monorepo enforces a **Single Version Policy (SVP)**: every external package exists in **exactly one version** across all workspaces. Enforced by [syncpack](https://jamiemason.github.io/syncpack/) via [.syncpackrc.json](.syncpackrc.json) and checked in CI on every push and PR.

## Why

Mixed versions in a pnpm monorepo cause:
- **Type mismatch** between packages (e.g. `zod@3` vs `zod@4` — generic types don't line up)
- **Duplicate singletons** in runtime (two `react`, two `pino` instances — `Invalid hook call`, logger state split)
- **Bundle bloat** (multiple copies shipped)
- **Peer dependency warnings** at install time

SVP eliminates all of these by making "mixed versions" structurally impossible.

## Rules

1. **Every external dep has one version** across the entire monorepo — enforced by `policy: sameRange` in `.syncpackrc.json`.
2. **Internal `@kb-labs/*` deps always use `workspace:*`** — pnpm resolves locally, replaces with `^version` on publish.
3. **New deps take the version already present** in the monorepo. Never pick a different one "just for this package".
4. **Bumping a dep is atomic**: update it everywhere in one PR, fix all breakages, or don't bump at all.

## Commands

```bash
pnpm deps:check    # list all mismatches (exit code 1 if any — used in CI)
pnpm deps:list     # full dependency listing
pnpm deps:fix      # auto-fix where possible + format package.json files
pnpm deps:format   # sort/format package.json fields only
pnpm deps:lint     # full check (versions + formatting) — used in CI
```

### Typical workflow

```bash
pnpm deps:check           # see what's wrong
pnpm deps:fix             # try auto-fix (works for patch/minor divergence)
# Major version splits (e.g. zod 3 vs 4) need manual resolution — see below
pnpm deps:check           # verify clean
```

## Resolving major-version splits

`syncpack fix-mismatches` won't auto-resolve across major versions (the semver ranges genuinely don't overlap). For those:

1. **Pick the target version** — usually the newest compatible with all consumers.
2. **Grep all `package.json` files** for the old range, replace with the new one.
3. **Run `pnpm install`** — lets pnpm resolve the new graph.
4. **Build & test** — fix any breaking changes from the major bump.
5. **`pnpm deps:check`** — confirm no mismatches remain.

## CI enforcement

- [.github/workflows/ci-pr.yml](.github/workflows/ci-pr.yml) — `deps` job runs `pnpm deps:lint` on every PR
- [.github/workflows/ci.yml](.github/workflows/ci.yml) — same job runs on every push to `main`
- Any mismatch fails CI. Fix before merging — do not skip this check.

## Config: [.syncpackrc.json](.syncpackrc.json)

Key settings:
- `source` globs match `pnpm-workspace.yaml` layout (core, sdk, cli, shared, plugins, adapters, studio, sites, templates, infra/devkit)
- `semverGroups` — `@kb-labs/**` deps must use `workspace:*`
- `versionGroups`:
  - `@kb-labs/**` — ignored (workspace resolution handles it)
  - Everything else — `policy: sameRange` (SVP)
- `sortFirst` / `sortAz` — canonical field order in every `package.json`

## Anti-patterns

- **DO NOT** pin a different version "just for this one package" — defeats SVP.
- **DO NOT** suppress syncpack errors or exclude packages from `source`. If a package genuinely can't share a version, that's a conversation — not a workaround.
- **DO NOT** commit with `pnpm deps:check` failing. Fix first.
- **DO NOT** run `pnpm add` in a sub-package with an explicit version that diverges from the monorepo's version. Use the existing range.

## Adding a new external dependency

1. Check if it's already in the monorepo: `pnpm deps:list | grep <pkg>`
2. If present → use the same range in your `package.json`
3. If absent → add with a sensible range (`^x.y.z`), run `pnpm install`, then `pnpm deps:check` to confirm no downstream conflicts

## Note on local install

The workspace-wide install requires `NODE_ENV` to be unset or `development`. If you run `pnpm install` and it silently skips devDependencies (`syncpack` missing from `node_modules`), check `echo $NODE_ENV`. VS Code sometimes inherits `production` from its parent env.
