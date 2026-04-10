# ADR-0010: Local Linking and Watch Pipeline

**Date:** 2025-10-05
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-11-03
**Tags:** [tooling, process]

## Context

Development in KB Labs involves working with dozens of packages distributed across different repositories (core, cli, shared, ai-*, product-*).
PNPM workspace proved too rigid:
- Breaks builds with cyclic dependencies
- Requires rebuild on every change
- Lacks flexibility between local and npm modes

To accelerate development and reduce context-switching, we need a tool that automatically:
- Links local packages
- Updates them on changes
- Can "rollback" to stable versions without manual work.

## Decision

devlink implements a three-phase linking pipeline:
1. **link** — connects all local packages
2. **watch** — monitors changes and updates links
3. **unlink** — reverts to npm versions

## Architecture Overview

```bash
┌──────────────┐
│ Scan repos   │  → finds all @kb-labs/* packages
├──────────────┤
│ Resolve deps │  → builds dependency graph
├──────────────┤
│ Link phase   │  → performs yalc add / yalc link / file:
├──────────────┤
│ Watch phase  │  → monitors src/** and rebuilds changed
├──────────────┤
│ Unlink phase │  → restores package.json + lockfile
└──────────────┘
```


## Implementation

### 1. Link Phase

**Goal:** Connect all local packages so they can be used without publishing.

**Algorithm:**
1. Find all package.json where "name" starts with @kb-labs/
2. Build dependency graph (dependsOn, dependents)
3. For each package:
   - If dependency found locally → use yalc publish + yalc add
   - Otherwise keep npm reference
4. Write log to .kb/devlink/graph.json

**Example:**

```bash
devlink link
# → Linked @kb-labs/core -> @kb-labs/devkit
# → Linked @kb-labs/cli -> @kb-labs/core
```


### 2. Watch Phase

**Goal:** Keep packages synchronized during development.

**Algorithm:**
1. Start file watcher for all src/** in local packages
2. On change:
   - Run pnpm build --filter <pkg>
   - Execute yalc push → rebuild links for dependent packages
3. Log actions (relinked, rebuilt, skipped)

**Options:**

| Flag | Description |
|------|-------------|
| `--debounce` | Delay between rebuilds |
| `--parallel` | Parallel rebuild of dependencies |
| `--no-build` | Skip build (relink only) |


### 3. Unlink Phase

**Goal:** Safely restore original dependencies before CI or publishing.

**Algorithm:**
1. Read .kb/devlink/graph.json
2. Remove all local links (yalc remove)
3. Restore original dependencies from npm
4. Recreate pnpm-lock.yaml

**Example:**

```bash
devlink unlink
# → Restored npm versions for @kb-labs/core, @kb-labs/devkit
```


### Internal Components

| Module | Responsibility |
|--------|----------------|
| `scanner.ts` | Recursively searches for packages |
| `resolver.ts` | Builds dependency graph |
| `linker.ts` | Performs publishing and linking |
| `watcher.ts` | Monitors changes and restarts linking |
| `unlinker.ts` | Rolls back local links |
| `graph.ts` | Reads and writes .kb/devlink/graph.json |
| `cli.ts` | Command interface: link, watch, unlink, status |


### Example Workflow

```bash
# Local development
devlink link
devlink watch

# Publishing
devlink unlink
pnpm build
pnpm publish

# Check status
devlink status
```


## Consequences

### Positive

- ✅ Automatic local linking without manual specification
- ✅ Safe operation with cyclic dependencies
- ✅ Fast development without rebuilding all packages
- ✅ Easy rollback to npm versions
- ✅ Integration with KB Labs DevKit and CLI

### Negative

| Risk | Mitigation |
|------|------------|
| Incompatibility with pnpm lockfile | Backup + restore lock before unlink |
| .yalc corruption | devlink clean for complete reset |
| Node/TS version differences | DevKit unified build presets |


### Future Enhancements

- `devlink diff` — compare local and npm versions
- `devlink auto-publish` — auto-publish on changes
- `devlink ui` — dependency visualization in KB Labs Studio
- Integration with KB Labs Analytics for change tracking