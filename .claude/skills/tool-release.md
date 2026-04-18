---
name: tool-release
description: KB Labs release pipeline — versioning, changelog, publish. Flows, checks, dry-run.
globs:
  - "plugins/release/**"
  - ".kb/kb.config.json"
  - ".kb/release/**"
---

# Release Pipeline

CLI entry point: `pnpm kb release <command>`.

## Release Order — IMPORTANT

**Always release in this order: `platform` first, then `sdk`.**

The SDK's `peerDependencies` use `>=2.0.0` ranges (not pinned versions), so order no longer causes
peer mismatch. However releasing SDK after platform is still correct practice because:
- SDK may re-export symbols from platform packages — platform must be published first
- Downstream users install platform + SDK together; platform being newer is always safe

**If you accidentally release SDK before platform:**
- Users get peer warnings on `pnpm install` (not errors — `>=2.0.0` is lenient)
- No functional breakage, but noisy install output

## Flows

Two named release profiles, configured in `.kb/kb.config.json` under `release.flows`.

| Flow | Packages | Strategy |
|------|----------|----------|
| `platform` | All 148 packages (excludes `@kb-labs/sdk`) | lockstep — all bump to the same version |
| `sdk` | `@kb-labs/sdk` only | independent — own semver |

**Always specify a flow.** No `--flow` = global config defaults (lockstep, all 149 packages).

## Commands

```bash
# Preview what would be released — no side effects
pnpm kb release plan --flow platform
pnpm kb release plan --flow sdk

# Generate changelog only (writes .kb/release/CHANGELOG.md)
pnpm kb release changelog --flow platform
pnpm kb release changelog --flow sdk

# Full pipeline dry-run (plan + checks, no publish, no git)
pnpm kb release run --flow platform --dry-run
pnpm kb release run --flow sdk --dry-run

# Real release (direct CLI — assumes already built)
pnpm kb release run --flow platform --skip-build
pnpm kb release run --flow sdk --skip-build
```

## Recommended Release Scripts (root package.json)

Always use these instead of calling `pnpm kb release run` directly.
They run a full build + plugin cache clear BEFORE the release pipeline.

```bash
# Dry-run (safe, no publish, no git)
pnpm release:platform:dry
pnpm release:sdk:dry

# Real release
pnpm release:platform
pnpm release:sdk
```

Each script does:
1. `kb-devkit run build` — full topological build of the entire monorepo
2. `pnpm kb marketplace:clear-cache` — invalidate CLI plugin cache after rebuild
3. `pnpm kb release run --flow <flow> --skip-build` — pipeline with `--skip-build` (already built)

**Why not build inside the pipeline**: the release CLI is itself a plugin. If `kb-devkit build --affected`
runs inside the pipeline, it may rebuild CLI packages and invalidate the plugin cache mid-run, crashing
the pipeline. Build must happen before the CLI process starts.

## Full Pipeline Stages

`plan → snapshot → checks → build → verify → version bump → changelog → publish → git tag`

Skip flags (use with care):
```bash
--skip-checks    # skip pre-release gates
--skip-build     # skip build stage (if already built)
--skip-verify    # skip pack+install verification
--dry-run        # simulate everything, no publish/git
--yes            # skip confirmation prompt
```

## Pre-release Checks

Configured in `release.checks` in `.kb/kb.config.json`. Currently:
- `build` — `pnpm run build` per scope
- `dist-exports` — `scripts/gates/check-dist-exports.sh` per package
- `pack-install` — `scripts/gates/check-pack-install.sh` per package
- `typecheck`, `lint`, `tests` — optional, per scope

## Version Bump Logic

- `auto` (default): reads conventional commits since last tag
  - `feat:` → minor, `BREAKING CHANGE` / `!:` → major, else → patch
- `platform` flow: lockstep — max bump across all packages → single version for all
- `sdk` flow: independent — `@kb-labs/sdk` bumped on its own commits only

## Changelog

- Template: `corporate-ai` (LLM-enhanced via configured LLM adapter)
- Groups configured in `release.changelog.groups` (Core & SDK, Gateway & API, Adapters, Plugins, Studio)
- Most commits land in **🔧 Other** because they lack a conventional scope
- Output: `.kb/release/CHANGELOG.md` (prepends new version block, deduplicates same-version)
- Fallback to simple bullet list if LLM unavailable

## Config Location

`release` key inside the `profiles[0].products` block in `.kb/kb.config.json`:

```json
"release": {
  "versioningStrategy": "lockstep",
  "packages": { "exclude": ["templates/*", "{{.Name}}", "@product-name/*"] },
  "flows": {
    "sdk":      { "versioningStrategy": "independent", "packages": { "include": ["@kb-labs/sdk"] } },
    "platform": { "versioningStrategy": "lockstep",    "packages": { "exclude": ["@kb-labs/sdk", "templates/*", "{{.Name}}", "@product-name/*"] } }
  },
  "changelog": {
    "locale": "en",
    "groups": [ ... ]
  },
  "checks": [ ... ]
}
```

## Adding a New Flow

Add to `release.flows` in `.kb/kb.config.json`:
```json
"my-flow": {
  "versioningStrategy": "independent",
  "packages": { "include": ["@kb-labs/my-package"] },
  "checks": []
}
```
No code changes needed — flows are config-only.

## Releasing Go Binaries (kb-create, kb-dev, kb-devkit, kb-deploy, kb-monitor)

Go binaries are released separately from npm packages via GitHub Actions + goreleaser.

**Trigger:** push a tag `v<MAJOR>.<MINOR>.<PATCH>-binaries` (e.g. `v0.4.7-binaries`).
The `-binaries` suffix distinguishes from npm release tags (`v2.47.0`).

```bash
# 1. Make changes to tools/kb-create/ (or any other tool)
# 2. Build locally to verify
cd tools/kb-create && go build -o kb-create .

# 3. Commit + push code changes
git add tools/kb-create/... && git commit -m "feat(launcher): ..." && git push origin main

# 4. Tag and push — GitHub Actions runs goreleaser for all 5 binaries
git tag v0.4.7-binaries && git push origin v0.4.7-binaries
```

GitHub Actions workflow (`.github/workflows/*.yml`):
- Triggered by `v*-binaries` tag
- Runs goreleaser with root `.goreleaser.yaml`
- Builds all 5 tools: kb-create, kb-dev, kb-devkit, kb-deploy, kb-monitor
- Platforms: darwin/linux/windows × amd64/arm64 (windows arm64 excluded)
- Uploads raw binaries (no archives) as GitHub Release assets
- Release marked `prerelease: false` so `/releases/latest/download/...` works

**Manifest change → install.sh picks it up automatically** — the manifest is
embedded in the binary at build time. No changes to the install script needed.

**Version bump:** increment the patch (or minor/major) from the previous `-binaries` tag.
Check the last tag: `gh release list --repo KirillBaranov/kb-labs --limit 3`

## Source Packages

| Package | Role |
|---------|------|
| `@kb-labs/release-manager-core` | `planRelease()`, `runReleasePipeline()`, `mergeConfigWithFlow()`, versioning strategies |
| `@kb-labs/release-manager-changelog` | Commit parsing, template rendering (`corporate-ai`) |
| `@kb-labs/release-manager-cli` | CLI commands (`plan`, `run`, `changelog`), REST handlers |
| `@kb-labs/release-manager-contracts` | Zod schemas, TypeScript types for REST API |

## Build After Changes

```bash
pnpm --filter @kb-labs/release-manager-contracts build
pnpm --filter @kb-labs/release-manager-core build
pnpm --filter @kb-labs/release-manager-cli build
```

Build in that order — contracts → core → cli.
