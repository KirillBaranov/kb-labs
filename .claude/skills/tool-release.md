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

---

> ## ⛔ КРИТИЧЕСКИЕ ПРАВИЛА — НАРУШЕНИЕ ЛОМАЕТ РЕЛИЗ
>
> **1. ТОЛЬКО через скрипты `pnpm release:*` (и `kb release promote` для промоушена) — никаких других способов.**
> Запрещено: `pnpm publish`, `npm publish`, `pnpm kb release run` напрямую (кроме `--channel canary`, см. ниже), `pnpm -r publish`.
> Только: `pnpm release:platform`, `pnpm release:sdk`, `pnpm release:platform:dry`, `pnpm release:sdk:dry`, `pnpm kb release promote`.
>
> **2. ВСЕГДА указывать `--flow`. Без флоу — НЕЛЬЗЯ.**
> `pnpm kb release run` без `--flow` захватит все 149 пакетов разом и сломает независимые циклы релиза platform и sdk.
> Каждый вызов должен иметь либо `--flow platform` либо `--flow sdk` — без исключений.
>
> **3. Changesets больше не используется.** `.changeset/`, `pnpm changeset`, `pnpm release`(старый alias на `changeset publish`) — удалены. `plugins/release/*` (эта страница) — единственный источник правды для версий/changelog/публикации.

---

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

## Stable Releases — Verdaccio Pre-flight, then Promote

Stable releases are a two-step flow: build once → publish to Verdaccio →
verify → **promote the same, already-committed versions to npm**. There is
no second bump, no second build, and no rerunning the full pipeline — the
old "toggle `registry`, rerun the script twice" pattern (and its false
"pipeline detects existing tag, skips bump" claim) is gone. Step 2 is a
dedicated command (`kb release promote`) that publishes exactly what step 1
already committed and tagged.

**Important constraint:** `config.registry` (the `release` key in
`.kb/kb.config.json`) is still config-only — no `--registry` CLI override for
`release run`. It controls where a `channel: stable` run publishes (normally
Verdaccio for this pre-flight step). `kb release promote` **does** accept a
`--registry` override (defaults from `config.publish.npmRegistry`, falling
back to real npm) since it's a separate, later step.

### Verdaccio setup (one-time)

```bash
# 1. Start Verdaccio
npx verdaccio -l 4873

# 2. Allow anonymous publish — edit ~/.config/verdaccio/config.yaml:
#    packages:
#      '@*/*':
#        access: $all
#        publish: $all       ← change from $authenticated
#      '**':
#        access: $all
#        publish: $all       ← change from $authenticated
#
#    max_body_size: 200mb    ← required for studio-app (~50MB tarball)
#
# 3. Add npmrc auth token so npm client doesn't block scoped packages:
#    echo '//localhost:4873/:_authToken=verdaccio-local' >> ~/.npmrc
#
# 4. Restart Verdaccio after config changes.
```

### Step 1 — Release to Verdaccio

```bash
# 1. Ensure Verdaccio is running on :4873 (see setup above)

# 2. Set registry in .kb/kb.config.json
#    "release": { "registry": "http://localhost:4873", ... }

# 3. Run the full pipeline — build + bump + git commit/tag + publish to
#    Verdaccio + registry verification (mandatory for stable, not opt-in —
#    confirms the published tarball is sane before it's ever eligible for
#    promotion)
NPM_REGISTRY=http://localhost:4873 NPM_TOKEN=verdaccio-local pnpm release:platform
# or:
NPM_REGISTRY=http://localhost:4873 NPM_TOKEN=verdaccio-local pnpm release:sdk
```

After this step: `package.json` versions are bumped, git commit + tag are
created, packages are published to `http://localhost:4873` and verified
against it (`plugins/release/manager-core/src/verdaccio-verify.ts`).

> **Version drift warning:** if publish fails before the git commit/tag step, `package.json`
> files are already bumped but no tag exists. Each retry bumps again. To reset:
> `git diff --name-only | grep "package.json" | xargs git checkout --`

### Validate from Verdaccio (optional manual spot-check)

```bash
# Check a package in the registry
curl http://localhost:4873/@kb-labs/core-platform

# Install from Verdaccio in a separate test project
npm install @kb-labs/core-platform --registry http://localhost:4873
```

### Step 2 — Promote to npm

```bash
# 1. Remove "registry" field from .kb/kb.config.json (or leave it — promote
#    ignores config.registry entirely, it always targets
#    config.publish.npmRegistry / real npm)

# 2. Promote the exact versions committed in Step 1 — no re-bump, no rebuild,
#    no re-plan. Publishes whatever is currently on disk in package.json.
pnpm kb release promote --scope <scope>
# e.g.:
pnpm kb release promote --scope @kb-labs/sdk

# --tag/--registry override config.publish.stableTag/npmRegistry for
# one-off or emergency promotes:
pnpm kb release promote --scope @kb-labs/sdk --tag next
```

Promote is idempotent — re-running it after a partial failure is safe
(already-published versions are treated as success).

## Canary Releases

Canary publishes straight to real npm under a prerelease dist-tag — no
Verdaccio leg, no git commit, no git tag. The version is computed in-memory
as `<base-version>-canary.<shortsha>` and only ever exists on the npm
registry; `package.json` and git history stay untouched.

```bash
pnpm kb release run --flow platform --channel canary --yes
# or:
pnpm kb release run --flow sdk --channel canary --yes

# Preview the canary version shape without publishing:
pnpm kb release plan --flow sdk --channel canary
```

Users install a canary build with `npm install @kb-labs/sdk@canary` (dist-tag
name from `config.publish.canaryTag`, default `canary`). Because canary
versions are deterministic per commit, retrying a failed canary run from the
same commit is naturally idempotent — no checkpoint needed.

---

## Recommended Release Scripts (root package.json)

Always use these instead of calling `pnpm kb release run` directly for stable releases.
They run a full build + plugin cache clear BEFORE the release pipeline.

```bash
# Dry-run (safe, no publish, no git)
pnpm release:platform:dry
pnpm release:sdk:dry

# Release (channel: stable, target registry from config.registry — Verdaccio
# for the pre-flight step above, or npm directly if no override is set, as
# in CI — see .github/workflows/release.yml)
pnpm release:platform
pnpm release:sdk
```

Each script does:
1. `node scripts/release-preflight.mjs` — token + registry reachability check
2. `kb-devkit run build` — full topological build of the entire monorepo (CLI discovery cache auto-invalidates via content-hash check)
3. `pnpm kb release run --flow <flow> --skip-build --yes` — pipeline with `--skip-build` (already built)

The preflight reads `NPM_REGISTRY` env var to check the right registry.
For Verdaccio: `NPM_REGISTRY=http://localhost:4873 NPM_TOKEN=verdaccio-local pnpm release:platform`

**Why not build inside the pipeline**: the release CLI is itself a plugin. If `kb-devkit build --affected`
runs inside the pipeline, it may rebuild CLI packages and invalidate the plugin cache mid-run, crashing
the pipeline. Build must happen before the CLI process starts.

## Full Pipeline Stages

`plan → snapshot → checks → build → verify → version bump → changelog → publish → registry verify → git tag`

The last two stages differ by channel:
- **stable**: version bump persists to `package.json`, changelog is generated and written, publish targets `config.registry`, registry verification is mandatory, git commit/tag/push runs.
- **canary**: version bump, changelog, and git commit/tag/push are all skipped — only plan → checks → build → verify → publish run, targeting `config.publish.npmRegistry` (real npm) under `config.publish.canaryTag`.

Skip flags (use with care):
```bash
--skip-checks    # skip pre-release gates
--skip-build     # skip build stage (if already built)
--skip-verify    # skip pack+install verification
--dry-run        # simulate everything, no publish/git
--yes            # skip confirmation prompt
--channel        # 'stable' (default) or 'canary'
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
  "channel": "stable",
  "packages": { "exclude": ["templates/*", "{{.Name}}", "@product-name/*"] },
  "flows": {
    "sdk":      { "versioningStrategy": "independent", "packages": { "include": ["@kb-labs/sdk"] } },
    "platform": { "versioningStrategy": "lockstep",    "packages": { "exclude": ["@kb-labs/sdk", "templates/*", "{{.Name}}", "@product-name/*"] } }
  },
  "publish": {
    "access": "public",
    "canaryTag": "canary",
    "stableTag": "latest",
    "npmRegistry": "https://registry.npmjs.org",
    "verifyRegistryTimeoutMs": 30000
  },
  "changelog": {
    "locale": "en",
    "groups": [ ... ]
  },
  "checks": [ ... ]
}
```

`channel` and the `publish.*` fields above are all optional — every default
matches current stable behavior, so omitting them changes nothing.

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
| `@kb-labs/release-manager-core` | `planRelease()`, `runReleasePipeline()`, `mergeConfigWithFlow()`, versioning strategies, `resolvePublishTag`/`resolvePublishRegistry` (`channel.ts`), `verifyAgainstRegistry` (`verdaccio-verify.ts`) |
| `@kb-labs/release-manager-changelog` | Commit parsing, template rendering (`corporate-ai`) |
| `@kb-labs/release-manager-cli` | CLI commands (`plan`, `run`, `changelog`, `publish`, `promote`), REST handlers |
| `@kb-labs/release-manager-contracts` | Zod schemas, TypeScript types for REST API (`ReleaseChannelSchema`, etc.) |

## Build After Changes

```bash
pnpm --filter @kb-labs/release-manager-contracts build
pnpm --filter @kb-labs/release-manager-core build
pnpm --filter @kb-labs/release-manager-cli build
```

Build in that order — contracts → core → cli.
