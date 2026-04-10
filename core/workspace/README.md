# @kb-labs/core-workspace

> **Core workspace utilities for KB Labs, including platform/project root resolution.** Provides utilities for locating the KB Labs platform installation and the user's project directory for internal tooling consumption (CLI, services, dev tools).

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18.18.0+-green.svg)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-9.0.0+-orange.svg)](https://pnpm.io/)

## 🎯 Vision & Purpose

**@kb-labs/core-workspace** provides root-directory resolution utilities shared by CLI, services, and `kb-dev`.

KB Labs distinguishes **two** logical roots, which may coincide (dev mode) or differ (installed mode):

| Root            | What it is                                                                                       | Where it lives                                      |
| --------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| **platformRoot** | Directory that contains the installed KB Labs platform code (parent of `node_modules/@kb-labs/*`) | `/opt/kb-labs` (installed), workspace root (dev)    |
| **projectRoot**  | Directory that contains the user's `.kb/kb.config.json` and all per-project plugin state         | `~/work/my-app` (installed), workspace root (dev)   |

**Why two roots?** Plugin discovery needs to scan the platform's `node_modules`, while platform state (`.kb/qa`, `.kb/mind`, `.kb/marketplace.lock`, adapter storage paths like `.kb/database/kb.sqlite`) belongs to the user's project. Until the platform moved out of the workspace, both assumptions resolved to the same `cwd` — and the codebase silently conflated them. This package makes the distinction explicit.

## 🏗️ Architecture

### Core Functions

#### `resolveRoots(options)` — main entry point

Resolves both `platformRoot` and `projectRoot` in a single call. This is what the CLI bootstrap, service bootstrap, and `kb-dev` should use.

```typescript
const { platformRoot, projectRoot, sameLocation, sources } = await resolveRoots({
  moduleUrl: import.meta.url, // from the caller's binary/entry
  startDir: process.cwd(),
})
```

- `sameLocation: true` ⇒ dev mode (both roots are the same directory).
- `sources.platform` / `sources.project` describe how each root was discovered (`'explicit' | 'env' | 'module' | 'marker' | 'config' | 'repo' | 'fallback'`).

#### `resolvePlatformRoot(options)`

Finds the directory that contains the installed KB Labs platform (parent of `node_modules/@kb-labs/*`).

Priority chain:

1. Explicit `cwd` option.
2. `KB_PLATFORM_ROOT` env var (set by the installer wrapper in installed mode).
3. Walk up from `moduleUrl` (`import.meta.url` of the caller). This walks all the way up and:
   - Prefers the **top-most** `pnpm-workspace.yaml` if one exists (handles KB Labs "workspace of workspaces" dev layout).
   - Falls back to the first directory whose `node_modules` contains a known platform marker (`@kb-labs/cli-bin`, `@kb-labs/core-runtime`) — this is the normal installed-mode path.
4. Walk up from `startDir` looking for the same markers or `pnpm-workspace.yaml`.
5. Repository root via `findRepoRoot`.
6. Fallback to `startDir`.

#### `resolveProjectRoot(options)`

Finds the user's project root — the directory containing `.kb/kb.config.json`.

Priority chain:

1. Explicit `cwd` option.
2. Env vars: `KB_PROJECT_ROOT` (preferred) or legacy `KB_LABS_WORKSPACE_ROOT` / `KB_LABS_REPO_ROOT`.
3. Nearest `.kb/kb.config.json` ancestor walking up from `startDir`.
4. Repository root via `findRepoRoot`.
5. Fallback to `startDir`.

#### `resolveWorkspaceRoot(options)` — deprecated alias

Kept as an alias of `resolveProjectRoot` for backwards compatibility. Prefer the explicit name.

## 🚀 Quick Start

### Installation

```bash
pnpm add @kb-labs/core-workspace
```

### Basic Usage

```typescript
import { resolveRoots } from '@kb-labs/core-workspace'

// In a CLI entrypoint (bin.ts):
const { platformRoot, projectRoot, sameLocation } = await resolveRoots({
  moduleUrl: import.meta.url,
  startDir: process.cwd(),
})

console.log({ platformRoot, projectRoot, sameLocation })
```

### In dev mode (monorepo workspace)

```text
platformRoot === projectRoot === <workspace-root>
sameLocation:   true
sources:        { platform: 'module', project: 'config' }
```

### In installed mode

```text
platformRoot:  /opt/kb-labs                    (from KB_PLATFORM_ROOT or moduleUrl walk-up)
projectRoot:   /home/user/work/my-project      (from .kb/kb.config.json walk-up)
sameLocation:  false
```

## ✨ Features

- **Two-root resolution**: clearly distinguishes platform code location from project state location.
- **Multiple discovery signals**: explicit options, env vars, `import.meta.url` walk-up, marker walk-up, repo root.
- **Dev/installed parity**: same API works in workspace dev mode and in deployed/installed mode; callers don't need to branch.
- **Nested-workspace aware**: handles the KB Labs "workspace of workspaces" layout where sub-repos each have their own `pnpm-workspace.yaml`.
- **Backwards compatible**: legacy `resolveWorkspaceRoot` and `KB_LABS_WORKSPACE_ROOT` / `KB_LABS_REPO_ROOT` env vars still work.

## 🔧 Configuration

### Environment Variables

| Variable                  | Purpose                                                                       |
| ------------------------- | ----------------------------------------------------------------------------- |
| `KB_PLATFORM_ROOT`        | Override platform root (installer wrapper, CI).                                |
| `KB_PROJECT_ROOT`         | Override project root.                                                         |
| `KB_LABS_WORKSPACE_ROOT`  | Legacy alias for `KB_PROJECT_ROOT` (kept for backwards compatibility).         |
| `KB_LABS_REPO_ROOT`       | Legacy alias for `KB_PROJECT_ROOT` (kept for backwards compatibility).         |

## 🤝 Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for development guidelines.

## 📄 License

KB Public License v1.1 © KB Labs
