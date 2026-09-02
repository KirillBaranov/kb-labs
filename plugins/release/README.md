# @kb-labs/release

> Release manager — plan, build, verify, publish, and audit releases across your workspace.

![license](https://img.shields.io/badge/license-MIT-green)
![platform](https://img.shields.io/badge/kb--labs-%3E%3D0.1.0-orange)
![tags](https://img.shields.io/badge/tags-release%20%7C%20publish%20%7C%20versioning-lightgrey)

---

## Overview

Release Manager automates the full release cycle for monorepos: detects changed
packages, computes version bumps from conventional commits, generates changelogs
with LLM assistance, builds and verifies artifacts, publishes to npm, and creates
git tags — all in one pipeline. Individual steps can be run separately for
CI or debugging.

---

## Features

- Auto-detects changed packages and version bump strategy from commit history
- LLM-assisted changelog generation with customizable templates
- Safe build: builds into temp dir then atomically swaps `dist/`
- `npm pack` artifact verification — catches directory imports, test file leaks, missing exports
- Interactive 2FA support for npm publish
- Rollback to pre-release snapshot if anything goes wrong
- Workflow templates: full release, hotfix, dry-run
- Studio UI for visual release management

---

## Requirements

**KB Labs platform** `>= 0.1.0`

**Platform services**

| Service | Required | Purpose |
|---------|----------|---------|
| `cache` | Required | Plan and changelog caching |
| `storage` | Required | Artifact and report storage |
| `llm` | Optional | Changelog generation |
| `analytics` | Optional | Release event tracking |

**Environment variables**

| Variable | Required | Description |
|----------|----------|-------------|
| `NPM_TOKEN` | Yes (publish) | npm registry auth token |
| `GITHUB_TOKEN` | No | GitHub API for CI integrations |
| `KB_RELEASE_*` | No | Plugin-specific overrides |

---

## Installation

```bash
pnpm kb marketplace install @kb-labs/release-entry
```

---

## Commands

### Full pipeline

`kb release run` — the checkout-based full pipeline (plan → checks → build →
pack → publish → git in one shot, no bundle, no receipt, no approval) has been
deleted (release control-plane cutover, execution plan §11 item 7). The
receipt-driven replacement is:

```bash
kb release candidate --flow platform --target canary --dry-run --json  # rehearse
kb release candidate --flow platform --target canary --json            # drive it; stops at `bundled`
kb release approve --receipt <receiptId> --actor "$USER" --json         # the one human approval
kb release candidate --flow platform --target canary --json            # resume; same command, reads the receipt
```

See [docs/runbooks/release-control-plane.md](../../docs/runbooks/release-control-plane.md)
for the full operator flow, including reading a receipt and resuming
`needs-attention`.

### Step by step

```bash
kb release plan                          # detect changes + compute version bumps
kb release plan --bump minor --json

kb release verify                        # validate release readiness
kb release verify --fail-if-empty --fail-on-breaking

kb release checks                        # run pre-release checks from config

kb release changelog                     # generate from conventional commits
kb release changelog --from v1.0.0 --format md
kb release changelog --template corporate-ai
kb release changelog --breaking-only

kb release build                         # safe atomic build
kb release pack                          # verify npm artifacts
kb release version                       # bump package.json versions
kb release version --dry-run

kb release publish                       # publish to npm
kb release publish --otp 123456 --tag next

kb release git                           # commit + tag + push
kb release git --no-verify
```

### History and recovery

```bash
kb release report                        # last release report
kb release rollback                      # restore from pre-release backup
```

**Full command reference**

| Command | Description |
|---------|-------------|
| `kb release candidate` | Drive a release candidate receipt (replaces `release run`) |
| `kb release approve` | Record the one human approval on a receipt |
| `kb release receipt` | Inspect a receipt's state and transition history |
| `kb release plan` | Compute version bumps |
| `kb release verify` | Validate release readiness |
| `kb release checks` | Run configured pre-release checks |
| `kb release changelog` | Generate changelog |
| `kb release build` | Safe atomic build |
| `kb release pack` | Verify npm artifacts |
| `kb release version` | Bump package.json versions |
| `kb release publish` | Publish to npm |
| `kb release git` | Commit, tag, push |
| `kb release report` | Show last release report |
| `kb release rollback` | Restore pre-release snapshot |

---

## Configuration

```jsonc
{
  "release": {
    "bump": "auto",
    "checks": [
      { "name": "lint",  "command": "pnpm lint" },
      { "name": "test",  "command": "pnpm test" },
      { "name": "types", "command": "pnpm type-check" }
    ],
    "changelog": {
      "template": "corporate-ai",
      "level": "standard"
    }
  }
}
```

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `bump` | `patch \| minor \| major \| auto` | `auto` | Default bump strategy |
| `checks` | `array` | `[]` | Pre-release checks to run |
| `changelog.template` | `string` | `standard` | `corporate`, `corporate-ai`, `technical`, `compact`, or custom path |
| `changelog.level` | `compact \| standard \| detailed` | `standard` | Changelog detail level |

---

## Workflow Templates

| Template | Description |
|----------|-------------|
| `full-release` | plan → checks → build → pack → approve → publish → git |
| `hotfix` | plan → approve → publish → git (patch, no checks) |
| `dry-run` | plan + checks + pack + changelog — no publish or git ops |

```bash
kb workflow run --workflow-id=release/full-release
kb workflow run --workflow-id=release/hotfix
kb workflow run --workflow-id=release/dry-run
```

---

## REST API

Requires the `gateway` plugin.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/plugins/release/status` | Release status |
| `GET` | `/v1/plugins/release/scopes` | Available release scopes |
| `GET` | `/v1/plugins/release/plan` | Current release plan |
| `POST` | `/v1/plugins/release/generate` | Generate plan with LLM |
| `DELETE` | `/v1/plugins/release/plan` | Reset plan |
| `GET` | `/v1/plugins/release/changelog` | Current changelog |
| `POST` | `/v1/plugins/release/changelog/generate` | Generate changelog with LLM |
| `POST` | `/v1/plugins/release/changelog/save` | Save edited changelog |
| `POST` | `/v1/plugins/release/run` | Execute release pipeline |
| `GET` | `/v1/plugins/release/report` | Latest release report |
| `GET` | `/v1/plugins/release/history` | Release history |
| `GET` | `/v1/plugins/release/git-timeline` | Git commit timeline |
| `GET` | `/v1/plugins/release/preview` | Package contents preview |
| `POST` | `/v1/plugins/release/build` | Trigger build |
| `GET` | `/v1/plugins/release/checklist` | Unified release checklist |
| `GET` | `/v1/plugins/release/checks` | Configured pre-release checks |
| `POST` | `/v1/plugins/release/checks/run` | Run all checks |

---

## Studio

Adds a **Release** page to KB Labs Studio (sidebar order 60).

| Page | Route | Description |
|------|-------|-------------|
| Release | `/p/release` | Visual release pipeline with checklist |

---

## Permissions

| Category | Scope | Reason |
|----------|-------|--------|
| Git | `GIT_*`, `SSH_*`, `HOME`, `USER` | Commits, tags, push |
| Filesystem (rw) | `.kb/release/**`, `package.json`, `CHANGELOG.md`, `**/*.yaml` | Plan, report, version files |
| Shell | `git`, `npm` | Git tagging, npm publish |
| Environment | `NPM_TOKEN`, `GITHUB_TOKEN`, `KB_RELEASE_*` | Publishing and CI |
| Platform | `llm`, `cache`, `analytics` | Changelog generation and caching |
| Quotas | 30 min timeout, 2 GB RAM, 5 min CPU | 148-package monorepo support |

---

## Artifacts

| Path | Description |
|------|-------------|
| `.kb/release/plan.json` | Current release plan |
| `.kb/release/report.json` | Last release execution report |
| `.kb/release/changelog.md` | Generated workspace changelog |

---

## Changelog

### 0.1.0

- Initial release: full pipeline, step commands, changelog templates, workflow templates, Studio page

---

## License

MIT
