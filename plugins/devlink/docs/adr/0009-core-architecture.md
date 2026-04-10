# ADR-0009: Core Architecture and Local Linking Flow

**Date:** 2025-10-05
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-11-03
**Tags:** [architecture, tooling]

## Context

The KB Labs ecosystem includes multiple independent repositories (core, cli, shared, ai-*, etc.).
Traditional workspace tools (e.g. pnpm, lerna) introduce several issues:

- Cyclic dependency limitations between internal packages (e.g. core/sys ↔ core/config)
- Frequent rebuilds and re-linking after changes
- Overhead of managing multiple workspace roots
- Inconsistent behavior between local and CI environments

To solve these, we introduce a custom local linking orchestrator: KB Labs DevLink.

## Decision

Implement a lightweight local dependency linker and publisher (devlink) that replaces workspace-based development for local KB Labs packages.

## Goals

1. Automatic local linking
   - Detect all local @kb-labs/* packages recursively across the umbrella directory.
   - Auto-link dependencies using yalc or file: without manual configuration.
2. Hot-sync development
   - Detect file changes and rebuild + relink affected packages automatically.
   - Provide a devlink watch mode for continuous local development.
3. Safe publish pipeline
   - Use devlink publish to push updated packages to npm with:
     - auto semver bump
     - changelog generation
     - tag + push + npm publish
   - Switch seamlessly between local and npm sources.
4. Declarative config
   - Optional devlink.config.json at repo root (auto-generated defaults)
   - Configurable include/exclude patterns per repo
   - Integration with @kb-labs/devkit for consistent CLI experience

## Non-Goals

- Not a replacement for npm or pnpm
- Not a CI runner — CI uses npm registry for reproducibility
- Not a build system (delegates builds to devkit or existing commands)

## Architecture Overview

```bash
┌───────────────────────────────┐
│         @kb-labs/devlink      │
├───────────────────────────────┤
│  1. Scanner                   │  → Discovers all local @kb-labs/* packages
│  2. Resolver                  │  → Maps inter-repo dependency graph
│  3. Linker                    │  → Links via yalc or file:
│  4. Watcher (optional)        │  → Watches for changes, rebuilds + relinks
│  5. Publisher                 │  → npm publish pipeline
│  6. CLI layer                 │  → `devlink link`, `devlink watch`, `devlink publish`
└───────────────────────────────┘
```

### Link Modes

| Mode | Description | Example |
|------|-------------|---------|
| `local` | Uses yalc for fast dev linking | `devlink link` |
| `file` | Uses file: references for manual stability | `devlink link --file` |
| `npm` | Reverts all links to registry versions | `devlink unlink` |

### Commands (MVP)

| Command | Description |
|---------|-------------|
| `devlink link` | Link all local packages recursively |
| `devlink unlink` | Restore to npm registry versions |
| `devlink watch` | Auto rebuild + relink on file changes |
| `devlink publish` | Publish updated packages with semver bump |
| `devlink status` | Show local vs npm versions and diffs |

### Example Flow
```bash
# Development mode
devlink link
devlink watch

# Build & test as usual
pnpm build
pnpm test

# Prepare for CI
devlink unlink
pnpm build --clean

# Release
devlink publish
```

## Consequences

### Positive

- No manual rebuilds or relinking
- Supports cyclic dependencies safely
- Seamless switch between local and npm
- Unified versioning and changelog flow
- Faster iteration for single-developer workflows
- Integrates naturally with existing KB Labs CLI & DevKit

### Negative

| Risk | Mitigation |
|------|------------|
| Conflicts with pnpm lockfiles | Auto backup & restore pnpm-lock.yaml |
| Stale yalc caches | Add devlink clean command |
| CI inconsistencies | Force npm mode in CI via DEVLINK_MODE=npm |

## Implementation

### Future Enhancements

- Remote sync mode for shared environments
- Git diff–based selective publishing
- Integration with KB Labs analytics to track package updates
- UI mode inside KB Labs Studio