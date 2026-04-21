---
name: kb-labs-release
description: Use when the user wants to release a new platform version, publish packages, or release Go binaries. Covers both npm lockstep releases and Go binary tags.
user-invocable: true
---

# Release the KB Labs Platform

Two independent release tracks: **npm packages** (148 packages, lockstep) and **Go binaries** (5 tools).

## Before you start

```bash
# Check current published versions
gh release list --repo KirillBaranov/kb-labs --limit 5

# Check what's changed since last release
git log --oneline $(git describe --tags --abbrev=0)..HEAD
```

## Track 1 — npm packages (platform + sdk)

### Step 1: Build everything

```bash
pnpm release:platform:dry   # dry-run first — see what would change
```

Review the output. If it looks right:

```bash
pnpm release:platform       # full build + publish + git tag
```

This does: `kb-devkit run build` → `marketplace clear-cache` → `release run --flow platform --skip-build`

### Step 2: Release SDK (if changed)

```bash
pnpm release:sdk:dry        # preview
pnpm release:sdk            # publish
```

**Order matters**: always platform before sdk.

### After publish

```bash
# In any project using kb-create:
kb-create update            # picks up new versions
```

---

## Track 2 — Go binaries

Five tools: `kb-create`, `kb-dev`, `kb-devkit`, `kb-deploy`, `kb-monitor`.

Released by pushing a `v<VERSION>-binaries` tag — GitHub Actions runs goreleaser.

### Step 1: Check last binary tag

```bash
gh release list --repo KirillBaranov/kb-labs --limit 5
# Look for tags ending in -binaries, e.g. v0.5.12-binaries
```

### Step 2: Build locally to verify

```bash
cd tools/kb-dev && go build ./... && cd ../..
cd tools/kb-create && go build ./... && cd ../..
```

### Step 3: Commit code changes

```bash
git add tools/
git commit -m "feat(kb-dev): ..."
git push origin main
```

### Step 4: Tag and push

Increment patch from last binary tag:

```bash
git tag v0.5.13-binaries     # use next version
git push origin v0.5.13-binaries
```

GitHub Actions builds darwin/linux/windows × amd64/arm64 and attaches to the release.

### After binary release

Users running `kb-create update` get the new binaries automatically.
To verify: `kb-create doctor` shows which binary versions are installed.

---

## Releasing both tracks together

```bash
# 1. npm
pnpm release:platform

# 2. Verify npm published OK
pnpm kb --version

# 3. Binaries
git tag v0.5.13-binaries && git push origin v0.5.13-binaries
```

---

## Important rules

- Never run `pnpm -r publish` directly — use `pnpm kb release run`
- Never push a binary tag without committing the code changes first
- If publish fails mid-run: check which packages were published with `npm view @kb-labs/<pkg> version`, then re-run with `--skip-build`
- Platform flow is lockstep — all 148 packages get the same version number
