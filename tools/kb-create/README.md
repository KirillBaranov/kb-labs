# kb-create

> **One-command installer for the KB Labs platform.** Download, configure and launch the full KB Labs stack in seconds — no manual setup required.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Go](https://img.shields.io/badge/Go-1.21+-00ADD8.svg)](https://golang.org/)
[![KB Labs Platform](https://img.shields.io/badge/KB_Labs-Platform-blue.svg)](https://github.com/kb-labs)
[![Release](https://img.shields.io/github/v/release/KirillBaranov/kb-labs-create)](https://github.com/KirillBaranov/kb-labs-create/releases)

## Overview

`kb-create` is a standalone Go binary that installs and manages the KB Labs platform on your machine. It is completely independent — no Node.js, no existing KB Labs installation required to run it.

**Key features:**
- ✅ **Interactive TUI wizard** — pick services and plugins with checkboxes
- ✅ **Silent mode** — `--yes` for CI/scripted environments
- ✅ **Isolated platform directory** — platform lives separately from your project
- ✅ **CWD binding** — all CLI calls and artifacts are scoped to your project folder
- ✅ **Update with diff** — see exactly what changes before applying
- ✅ **Install logs** — every run is logged, follow with `--follow`
- ✅ **Environment doctor** — `kb-create doctor` checks PATH, tooling, and network
- ✅ **pnpm-first** — uses pnpm if available, falls back to npm
- ✅ **Project detection** — auto-detects language, package manager, frameworks, monorepo layout
- ✅ **Claude Code onboarding** — installs platform-aware skills and a managed `CLAUDE.md` section so AI agents understand your KB Labs project from day one

## Quick Start

### Install kb-create

```bash
curl https://raw.githubusercontent.com/KirillBaranov/kb-labs-create/main/install.sh | sh
```

This downloads the correct binary for your OS/arch and places it in `~/.local/bin/kb-create`.

Install a specific version:

```bash
curl -fsSL https://raw.githubusercontent.com/KirillBaranov/kb-labs-create/main/install.sh | sh -s -- --version v0.2.1
```

`install.sh` verifies SHA-256 checksums against the release `checksums.txt` before installing.
For pre-releases (for example `v0.2.0-beta.1`) always pass `--version`.

### Create a project

```bash
kb-create my-project
```

The wizard guides you through:
1. Platform directory (where node_modules live)
2. Project directory (your actual work folder)
3. Services to install (REST API, Workflow, Studio)
4. Plugins to install (mind, agents, ai-review, commit)

### Silent install with defaults

```bash
kb-create my-project --yes
```

Installs core + default services/plugins without any prompts.

## How It Works

```
kb-create my-project
        │
        ▼
   Interactive wizard
   ─────────────────────────────────────────────────
   Platform dir:  ~/kb-platform
   Project cwd:   ~/projects/my-project

   ◉ REST API       REST daemon (port 5050)
   ◉ Workflow       Workflow engine (port 7778)
   ○ Studio         Web UI (port 3000)

   ◉ mind           AI code search (RAG)
   ○ agents         Autonomous agents
   ─────────────────────────────────────────────────
        │
        ▼
   npm/pnpm install @kb-labs/* packages
   into ~/kb-platform/node_modules/
        │
        ▼
   Write ~/kb-platform/.kb/kb.config.json
   { "platform": "~/kb-platform", "cwd": "~/projects/my-project" }
        │
        ▼
   ✅ Done — run: kb dev:start
```

### Platform vs Project separation

The platform (node_modules) lives in one place; your project files live elsewhere. The KB Labs CLI reads `.kb/kb.config.json` and `chdir`s into `cwd` before executing any command — so all artifacts, logs and outputs land in your project folder.

```
~/kb-platform/          ← platform installation
  node_modules/
  package.json
  .kb/
    kb.config.json      ← cwd binding lives here
    logs/               ← install logs

~/projects/my-project/  ← your project
  .kb/                  ← runtime artifacts (created by platform)
```

## Commands

### `kb-create [project-dir]`

Default command. Launches the interactive wizard (or silent install with `--yes`).

```bash
kb-create my-project
kb-create my-project --yes
kb-create my-project --platform ~/custom/platform/path
```

| Flag | Description |
|------|-------------|
| `-y, --yes` | Skip wizard, install with defaults |
| `--platform <dir>` | Override default platform directory |
| `--demo` | Install demo plugins and run pipeline on your code |
| `--skip-claude` | Do not install Claude Code skills or `CLAUDE.md` section |
| `--no-claude-md` | Install Claude Code skills only; skip the `CLAUDE.md` merge |
| `--dev-manifest <path>` | Install from local packages via pnpm pack pre-step (see [Dev Mode](#dev-mode)) |
| `--registry <url>` | Use custom npm registry (e.g. `http://localhost:4873` for local verdaccio) |

### `kb-create update`

Compares the current manifest against the installed snapshot. Shows a diff, asks for confirmation, then applies updates. After the platform is updated, also re-applies Claude Code assets from the just-refreshed devkit (skills + the managed `CLAUDE.md` section). Use `--skip-claude` or `--no-claude-md` to opt out — same semantics as on install.

```bash
kb-create update
kb-create update --platform ~/kb-platform
kb-create update --skip-claude            # platform only, leave .claude/ alone
```

**Example output:**
```
[INFO] Checking for updates...

[INFO] Update plan
[INFO] Add:
  ● @kb-labs/new-plugin
[INFO] Update:
  ● @kb-labs/cli-bin
[INFO] Remove:
  ● @kb-labs/old-package

Apply updates? [Y/n]
```

### `kb-create status`

Shows what is currently installed and the platform configuration.

```bash
kb-create status
kb-create status --platform ~/kb-platform
```

**Example output:**
```
[INFO] Installation Status
  Platform:  ~/kb-platform
  Project:   ~/projects/my-project
  PM:        pnpm
  Installed: 2026-02-25 10:00
  Manifest:  1.0.0

[INFO] Core packages
    ● @kb-labs/cli-bin
    ● @kb-labs/sdk

[INFO] Services
    ● rest       REST API daemon (port 5050)
    ● workflow   Workflow engine (port 7778)

[INFO] Plugins
    ● mind       AI-powered code search (RAG)
```

### `kb-create logs`

Prints the most recent install log.

```bash
kb-create logs                       # print last log
kb-create logs --follow              # stream in real time (like tail -f)
kb-create logs --platform ~/kb-platform
```

### `kb-create doctor`

Runs environment diagnostics used by installer/runtime.

```bash
kb-create doctor
```

Checks:
- `PATH` contains `~/.local/bin`
- `node`
- `git`
- `docker`
- network reachability to `github.com`

## Claude Code Onboarding

`kb-create` installs a curated set of Claude Code skills and an opt-in managed
section of `CLAUDE.md` directly into your project, so AI agents (Claude Code,
Cursor with the same `.claude/` discovery, etc.) understand the platform from
the first command.

### What gets installed

Files are written into the **project** directory (the folder where you actually
work), not into the platform directory:

```
<project>/
├── CLAUDE.md                              ← managed section between markers
└── .claude/
    ├── .kb-labs.json                      ← state file (versions, sha256, timestamps)
    └── skills/
        ├── kb-labs-quickstart/SKILL.md
        ├── kb-labs-create-plugin/SKILL.md
        ├── kb-labs-create-product/SKILL.md
        ├── kb-labs-troubleshoot/SKILL.md
        ├── kb-labs-explore/SKILL.md
        └── kb-labs-update/SKILL.md
```

The skill catalogue and the `CLAUDE.md` snippet are shipped by
`@kb-labs/devkit` (the internal toolkit pulled in as a dependency of the
platform). `kb-create` reads them from
`<platform>/node_modules/@kb-labs/devkit/assets/claude/` after the platform is
installed and copies them into your project.

### Skill namespace

Claude Code uses a flat `.claude/skills/` layout, so namespacing is done via
the directory-name prefix `kb-labs-`. Anything without that prefix is treated
as user-authored and is **never** touched by `kb-create` — including on update
and uninstall.

### `CLAUDE.md` merge behaviour

`kb-create` is conservative with `CLAUDE.md`. It distinguishes three cases:

| Case | Action |
|---|---|
| No `CLAUDE.md` exists | Create it with a header and the managed section. |
| `CLAUDE.md` exists with our markers | Replace just the marked block in place — surrounding content is untouched. |
| `CLAUDE.md` exists without our markers | Ask `[Y/n/v(iew)]` before appending. With `--yes` the section is appended at the end. |

The managed section is delimited by HTML comments containing the version, so
that future updates can replace it deterministically:

```markdown
<!-- BEGIN: KB Labs v1.5.0 (managed by kb-create) - DO NOT EDIT -->
...
<!-- END: KB Labs (managed) -->
```

### State tracking

Every install/update writes `.claude/.kb-labs.json` with the devkit version,
timestamps, and a sha256 of every installed skill body. The next `kb-create
update` uses this state to classify skills as added/updated/unchanged and to
detect drift even when version strings did not change (useful when developing
against a `link:` devkit).

### Lifecycle

| Command | Effect on Claude assets |
|---|---|
| `kb-create my-project` | Install skills + create/append managed `CLAUDE.md` section. Honours `--skip-claude` and `--no-claude-md`. |
| `kb-create update` | Re-resolve devkit assets and apply diffs (added / updated / removed skills, refreshed managed section). Same flags. |
| `kb-create uninstall` | Remove every `kb-labs-*` skill, strip the managed section. If `kb-create` originally created `CLAUDE.md` itself and nothing else of substance is left, the file is removed; otherwise only the managed section is stripped and user content is preserved. |

### Failure model

Claude asset operations are **never fatal** to the rest of `kb-create`. If the
devkit assets directory cannot be found, the manifest is invalid, or any skill
copy fails, the launcher logs a warning and continues — the platform install,
update, or uninstall itself always proceeds.

### Opting out

| Goal | Flag |
|---|---|
| Don't touch `.claude/` or `CLAUDE.md` at all | `--skip-claude` |
| Install skills but don't merge `CLAUDE.md` | `--no-claude-md` |

These flags work on both `kb-create` (install) and `kb-create update`.

## Installation

### curl | sh (recommended)

```bash
curl https://raw.githubusercontent.com/KirillBaranov/kb-labs-create/main/install.sh | sh
```

Installs to `~/.local/bin/kb-create`. No `sudo` needed.

### Manual download

Download the correct binary from [GitHub Releases](https://github.com/KirillBaranov/kb-labs-create/releases/latest):

| Platform | Binary |
|----------|--------|
| macOS Apple Silicon | `kb-create-darwin-arm64` |
| macOS Intel | `kb-create-darwin-amd64` |
| Linux x86_64 | `kb-create-linux-amd64` |
| Linux ARM64 | `kb-create-linux-arm64` |

```bash
# Example for macOS Apple Silicon
curl -fsSL https://github.com/KirillBaranov/kb-labs-create/releases/latest/download/kb-create-darwin-arm64 \
  -o ~/.local/bin/kb-create
chmod +x ~/.local/bin/kb-create
```

### Build from source

```bash
git clone https://github.com/KirillBaranov/kb-labs-create
cd kb-labs-create
go build -o kb-create .
```

Requires Go 1.21+.

## Dev Mode

When developing KB Labs itself you need to test the installer against local package builds — without publishing to npm on every change. There are two approaches:

### Option A — Local verdaccio registry (recommended)

The cleanest approach. Spins up a local npm registry, publishes all `@kb-labs/*` packages to it, then installs from there. Fully prod-equivalent — no localPath, no symlinks.

```bash
# 1. Start local registry (once)
kb-dev start verdaccio

# 2. Publish all @kb-labs/* packages to it (after every change)
./scripts/publish-local.sh

# 3. Install using local registry
kb-create /tmp/my-project --yes \
    --registry http://localhost:4873 \
    --platform /tmp/kb-test-platform
```

Verdaccio proxies unknown packages to the real npm registry, so transitive external dependencies resolve automatically. `@kb-labs/*` packages are served from local storage only.

### Option B — dev-manifest with pnpm pack

For quick testing of a handful of packages without a full publish. `kb-create` runs `pnpm pack` on each `localPath` directory, producing self-contained tarballs, then installs those. This correctly handles `workspace:*` and `link:` refs inside the packages.

```json
{
  "version": "3.0.0",
  "registryUrl": "https://registry.npmjs.org",
  "core": [
    { "name": "@kb-labs/cli-bin", "localPath": "/Users/you/kb-labs-workspace/platform/kb-labs-cli/packages/cli-bin" },
    { "name": "@kb-labs/sdk" }
  ],
  "services": [
    { "id": "rest", "pkg": "@kb-labs/rest-api-app", "description": "REST API (port 5050)", "default": true,
      "localPath": "/Users/you/kb-labs-workspace/platform/kb-labs-rest-api/apps/rest-api" }
  ],
  "binaries": [
    { "id": "kb-dev", "name": "kb-dev", "description": "Service manager",
      "localPath": "/Users/you/kb-labs-workspace/infra/kb-labs-dev/kb-dev" }
  ]
}
```

```bash
# 1. Copy example and fill in paths
cp dev-manifest.json.example dev-manifest.json

# 2. Install
kb-create /tmp/my-project --yes \
    --dev-manifest ./dev-manifest.json \
    --platform /tmp/kb-test-platform
```

The pack pre-step only runs when `--dev-manifest` is passed — prod mode is unchanged. The real `dev-manifest.json` is gitignored (machine-specific paths). Commit only `dev-manifest.json.example`.

For binaries: `localPath` copies the binary directly instead of downloading from GitHub Releases.

## Manifest

The list of installable packages is defined in [`internal/manifest/manifest.json`](internal/manifest/manifest.json) and embedded into the binary at build time. To update the package list, edit that file and rebuild.

**Structure:**

```json
{
  "version": "1.0.0",
  "registryUrl": "https://registry.npmjs.org",
  "core": [
    { "name": "@kb-labs/cli-bin" }
  ],
  "services": [
    { "id": "rest", "pkg": "@kb-labs/rest-api", "description": "...", "default": true }
  ],
  "plugins": [
    { "id": "mind", "pkg": "@kb-labs/mind", "description": "...", "default": true }
  ]
}
```

**Extensibility:** `manifest.Loader` supports a fallback chain — Remote URL → Local override file → Embedded JSON. When a remote registry endpoint is available, set `LoadOptions.RemoteURL` to always fetch the latest manifest without rebuilding the binary.

## Architecture

```
kb-labs-create/
├── main.go                        ← entrypoint, injects build-time version
├── manifest.json                  ← canonical package list (see internal/manifest/)
├── cmd/
│   ├── root.go                    ← cobra root, --version, Execute()
│   ├── create.go                  ← default command: wizard → install → claude assets
│   ├── update.go                  ← diff → confirm → npm update → claude assets
│   ├── uninstall.go               ← strip claude assets → remove platform
│   ├── status.go                  ← read config, pretty-print
│   ├── logs.go                    ← cat / tail -f install log
│   ├── doctor.go                  ← environment diagnostics
│   ├── output.go                  ← unified CLI output styles
│   └── claude_io.go               ← stdPrompter + printClaudeSummary helper
└── internal/
    ├── detect/
    │   ├── detect.go              ← ProjectProfile types, Detect() orchestrator, Summary()
    │   ├── lang.go                ← language detection (11 languages, file-existence table)
    │   ├── pm.go                  ← package manager detection (lockfile-first priority)
    │   ├── monorepo.go            ← monorepo detection (pnpm/npm/yarn/cargo/lerna/turbo/nx)
    │   ├── packages.go            ← workspace glob expansion + per-package scanning
    │   ├── commands.go            ← command extraction (Node/Go/Rust/Python/Java/Makefile)
    │   ├── framework.go           ← framework detection (config files + dependency scanning)
    │   └── detect_test.go         ← 34 tests covering all detectors
    ├── manifest/
    │   ├── types.go               ← Manifest, Package, Component, Binary structs + PackageSpec() methods
    │   ├── types_test.go          ← unit tests for PackageSpec / CorePackageSpecs / dev-manifest round-trip
    │   └── loader.go              ← Load() with fallback chain + //go:embed
    ├── pm/
    │   ├── pm.go                  ← PackageManager interface + Detect()
    │   ├── npm.go                 ← NpmManager
    │   └── pnpm.go                ← PnpmManager
    ├── wizard/
    │   └── wizard.go              ← Bubble Tea TUI (3-stage: dirs → options → confirm)
    ├── installer/
    │   └── installer.go           ← Install(), Diff(), Update()
    ├── config/
    │   └── config.go              ← Read/Write versioned PlatformConfig
    ├── claude/
    │   ├── claude.go              ← Install/Update/Uninstall public API + Options/Result/Logger/Prompter
    │   ├── manifest.go            ← Manifest type + ReadManifest validation
    │   ├── source.go              ← ResolveAssetsDir(platformDir, projectDir)
    │   ├── skills.go              ← copySkills (sha256 diff) + removeKbLabsSkills (prefix-guarded)
    │   ├── claudemd.go            ← mergeClaudeMd 3-case logic + stripClaudeMd
    │   ├── state.go               ← .claude/.kb-labs.json read/write/remove
    │   ├── errors.go              ← ErrAssetsNotFound / ErrInvalidManifest sentinels
    │   └── claude_test.go         ← 14 unit tests covering install/update/uninstall + edge cases
    └── logger/
        └── logger.go              ← io.MultiWriter(stderr + file)
```

### Extension points

| Point | How to extend |
|-------|--------------|
| **New packages/services/plugins** | Edit `internal/manifest/manifest.json`, rebuild |
| **Dev mode — verdaccio** | `kb-dev start verdaccio` + `./scripts/publish-local.sh` + `--registry http://localhost:4873` |
| **Dev mode — local packs** | Copy `dev-manifest.json.example` → `dev-manifest.json`, set `localPath` fields, pass `--dev-manifest` |
| **Remote manifest** | Set `manifest.LoadOptions.RemoteURL` — fallback to embedded if unreachable |
| **New package manager** | Implement `pm.PackageManager` interface, add to `pm.Detect()` |
| **New language/framework** | Add entry to data-driven table in `detect/lang.go` or `detect/framework.go` |
| **Config migrations** | Increment `configVersion`, add case in `config.Read()` |
| **Wizard steps** | Add a new `stage` const and handler in `wizard.go` |
| **New Claude skill** | Add a directory under `infra/kb-labs-devkit/assets/claude/skills/kb-labs-<id>/SKILL.md` and an entry in `assets/claude/manifest.json`. `kb-create` will pick it up on next install/update. |
| **Claude state schema** | Bump `stateSchemaVersion` in `internal/claude/state.go` and add a migration in `ReadState`. |

## FAQ

### Q: Do I need Node.js installed?

**A:** Yes — `kb-create` itself is a Go binary with no Node.js dependency, but it installs `@kb-labs/*` npm packages, so Node.js and npm (or pnpm) must be available on the system.

### Q: Where should I install the platform?

**A:** Anywhere you like — `~/kb-platform` is the default. The platform directory is independent from your project. You can have one platform installation shared across multiple projects (each with its own `cwd` binding), or a dedicated installation per project.

### Q: Can I run kb-create in CI?

**A:** Yes:
```bash
kb-create /workspace/my-project --yes --platform /opt/kb-platform
```

### Q: How do I update the platform later?

**A:**
```bash
kb-create update --platform ~/kb-platform
```

### Q: What if pnpm is not installed?

**A:** `kb-create` automatically falls back to npm. To use pnpm, install it first:
```bash
npm install -g pnpm
```

### Q: Can I customise what gets installed?

**A:** Yes — in wizard mode, use space to toggle any service or plugin. In silent mode, all items marked `"default": true` in the manifest are installed. For fine-grained control, edit the manifest and rebuild.

### Q: I don't use Claude Code — will `kb-create` still touch my repo with skills?

**A:** Yes by default, but the skills only live under `.claude/skills/kb-labs-*` and a marked section of `CLAUDE.md`. Both are inert for any tool that does not look at them. If you still want to opt out:

```bash
kb-create my-project --skip-claude        # no .claude/, no CLAUDE.md merge
kb-create my-project --no-claude-md       # skills only, leave CLAUDE.md alone
```

The same flags apply to `kb-create update`.

### Q: I already have a `CLAUDE.md` with my own instructions — will `kb-create` overwrite it?

**A:** No. `kb-create` looks for HTML markers `<!-- BEGIN: KB Labs ... -->` / `<!-- END: KB Labs ... -->` and only ever touches the content between them. If you have a `CLAUDE.md` without those markers, it asks `[Y/n/v(iew)]` before appending the managed section, and even then it appends rather than replaces. With `--yes` the section is appended at the end, leaving your content untouched at the top.

### Q: How do I remove just the Claude skills without uninstalling the platform?

**A:** Currently the cleanest path is `kb-create my-project --skip-claude` (a future install/update with this flag will leave `.claude/` as-is) plus manually deleting `.claude/skills/kb-labs-*` and the marked section. A dedicated `kb-create claude uninstall` subcommand is on the roadmap.

### Q: The binary shows version `dev` — is that normal?

**A:** Only when built with `go build .` directly. Official releases from GitHub have proper version strings injected by goreleaser via `-ldflags`. Check with `kb-create --version`.

## Development

```bash
# Clone
git clone https://github.com/KirillBaranov/kb-labs-create
cd kb-labs-create

# Install dependencies
go mod download

# Build
go build -o kb-create .

# Run tests
go test ./...

# Vet
go vet ./...

# Build for all platforms (requires goreleaser)
goreleaser build --snapshot --clean
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines.

## Support & Resources

- **Issues**: [Report bugs →](https://github.com/KirillBaranov/kb-labs-create/issues)
- **Discussions**: [Ask questions →](https://github.com/kb-labs/discussions)
- **KB Labs Platform**: [Main repository →](https://github.com/kb-labs)

## License

MIT — see [LICENSE](LICENSE) for details.
