# ADR-0022: Watch Mode Implementation

**Date:** 2025-10-19
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-11-03
**Tags:** [tooling, process]

## Context

After implementing the basic devlink linking system (ADR-0010), developers faced a significant workflow friction:

- **Manual rebuilds**: After changing a provider package, developers had to manually rebuild it
- **Manual refresh**: Consumers didn't automatically pick up changes, requiring manual restarts
- **Context switching**: Developers had to track which packages changed and which consumers needed updates
- **Slow iteration**: The manual rebuild-refresh cycle slowed down local development

For example, when working on `@kb-labs/cli-core` (provider) used by `@kb-labs/cli-commands` (consumer), every code change required:
1. Manual `pnpm build` in cli-core
2. Manual restart of cli-commands dev server
3. Tracking which other consumers also needed refresh

This workflow breaks the flow state and is especially painful in monorepo setups with 10+ interdependent packages.

## Decision

Implement **`kb devlink watch`** — a live watch mode that automatically:
1. Monitors file changes in provider packages
2. Triggers rebuilds when sources change
3. Refreshes all dependent consumers
4. Handles both `local` (link:) and `yalc` modes
5. Provides real-time feedback and error handling

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    DevLink Watch                         │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────┐ │
│  │   chokidar   │───▶│   p-queue    │───▶│ Consumer │ │
│  │ File Watcher │    │ Build Queue  │    │ Refresher│ │
│  └──────────────┘    └──────────────┘    └──────────┘ │
│         │                    │                   │      │
│         ▼                    ▼                   ▼      │
│  ┌──────────────────────────────────────────────────┐  │
│  │           Event Stream (human/JSON)              │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### Key Components

**1. File Watcher (chokidar)**
- Monitors: `src/**/*`, `package.json`, `tsconfig*.json`
- Ignores: `node_modules`, `.kb/devlink/backups`, test files
- Debounces changes (default 200ms) to coalesce rapid edits

**2. Build Queue (p-queue)**
- Parallel builds with configurable concurrency (default 4)
- **In-flight builds guard**: prevents concurrent builds of same provider
- Maintains `lastBuildStartTime` and `lastBuildEndTime` per provider

**3. Loop Protection**
- **Critical safety feature**: Ignores `dist/` changes within 500ms of build completion
- Prevents infinite loops when build writes to watched directories
- Tracks build timestamps per provider for accurate filtering

**4. Build Detection**
Priority order:
1. `package.json` → `devlink.watch.build` override (string or array)
2. `tsconfig.json` with `references` → use `tsc -b` (incremental)
3. `package.json` → `scripts.build` → use `pnpm run build`
4. Fallback → `pnpm -C <dir> build`

**5. Consumer Refresh**

Local mode:
```typescript
if (consumer.hasScript('devlink:refresh')) {
  await runCommand('pnpm run devlink:refresh', { cwd: consumer.dir })
} else {
  logger.info('refreshed (no-op)', { consumer }) // rely on dev watchers
}
```

Yalc mode:
```typescript
await runCommand('yalc publish', { cwd: provider.dir })
await runCommand('yalc update <provider>', { cwd: consumer.dir })
```

**6. Mode Detection**
Priority order:
1. Explicit `--mode` flag
2. `last-apply.json` → `mode` field
3. `lock.json` → `mode` field and `source` entries
4. Manifest scan for `link:` prefixes
5. Default to `auto`

### CLI Interface

```bash
kb devlink watch [options]

Options:
  --mode <auto|local|yalc>     Watch mode (auto-detected by default)
  --providers <glob>           Filter providers by pattern (e.g., @kb-labs/*)
  --consumers <glob>           Filter consumers by pattern
  --debounce <ms>              Debounce window (default: 200)
  --concurrency <n>            Max parallel builds (default: 4)
  --no-build                   Skip build, only refresh consumers
  --exit-on-error              Exit on first build error
  --dry-run                    Show what would be watched
  --json                       Output events as JSON
```

### Output Modes

**Human mode** (colored, real-time):
```
🔭 devlink:watch  mode=local  providers=12  consumers=37
• change  @kb-labs/cli-core  src/utils/x.ts
  ↳ build  @kb-labs/cli-core  (1.4s)
  ↳ refresh  @kb-labs/cli-commands (1 consumer) (0.9s)
✔ done
```

**JSON mode** (line-delimited, machine-readable):
```json
{"type":"changed","pkg":"@kb-labs/cli-core","files":["src/utils/x.ts"],"ts":"..."}
{"type":"building","pkg":"@kb-labs/cli-core","command":"tsc -b"}
{"type":"built","pkg":"@kb-labs/cli-core","duration":1400}
{"type":"refreshed","pkg":"@kb-labs/cli-core","consumers":["@kb-labs/cli-commands"],"duration":900}
```

## Consequences

### Positive

✅ **Instant feedback loop**: Changes propagate automatically in 1-2 seconds  
✅ **Parallel builds**: Multiple providers can build simultaneously (up to concurrency limit)  
✅ **Safe by default**: Loop protection prevents infinite rebuild cycles  
✅ **Mode flexibility**: Works with both local (link:) and yalc modes  
✅ **Developer experience**: Human-readable output with colors and progress  
✅ **Scriptable**: JSON output for CI/automation  
✅ **Graceful errors**: Build failures don't crash watch, continue monitoring  
✅ **No state pollution**: Runtime only, no persistent watch state files  

### Negative

| Risk | Mitigation |
|------|------------|
| High CPU usage during burst changes | Debounce (200ms) coalesces rapid edits |
| Builds may fail if dependencies not up-to-date | Use `kb devlink apply` first to ensure consistent state |
| Infinite loops if loop protection fails | 500ms window + explicit `dist/` filtering |
| Memory growth from event listeners | Graceful shutdown cleanup on Ctrl+C |
| Yalc mode slower than local | Yalc publish/update inherently slower; consider local mode for active dev |

### Alternatives Considered

**1. Use nodemon/watchman directly**
- ❌ Rejected: Too low-level, doesn't understand dependency graph
- ❌ No integration with devlink state (lock, journals)

**2. Integrate with existing build tools (turbo/nx)**
- ❌ Rejected: Adds heavy dependency, reduces flexibility
- ❌ Doesn't support cross-repo watching

**3. Watch + rebuild everything on any change**
- ❌ Rejected: Too slow for large monorepos
- ❌ Wastes CI resources, breaks incremental builds

**4. Only watch, no rebuild (rely on tsc --watch)**
- ❌ Rejected: Inconsistent with devlink's explicit build philosophy
- ❌ Doesn't work with non-TS packages

**5. Persistent watch state files**
- ❌ Rejected: Adds complexity, potential for drift
- ✅ Watch is runtime-only, stateless by design

## Implementation

### Files Created

**Core Engine** (`kb-labs-devlink/packages/core`):
- `src/devlink/watch/watch.ts` — Main orchestrator
- `src/devlink/watch/types.ts` — Type definitions
- `src/devlink/watch/mode-detector.ts` — Mode detection logic
- `src/devlink/watch/build-detector.ts` — Build command detection
- `src/devlink/watch/consumer-refresher.ts` — Consumer update logic
- `src/devlink/watch/dependency-resolver.ts` — Reverse dependency graph
- `src/devlink/watch/index.ts` — Public exports
- `src/api/watch.ts` — Facade API

**CLI Command** (`kb-labs-cli`):
- `packages/commands/src/commands/devlink/watch.ts` — CLI implementation
- Updated `packages/commands/src/commands/devlink/index.ts` — Registration

**Tests**:
- `src/devlink/watch/__tests__/build-detector.spec.ts`
- `src/devlink/watch/__tests__/mode-detector.spec.ts`
- `src/devlink/watch/__tests__/dependency-resolver.spec.ts`

### Dependencies Added

```json
{
  "chokidar": "^4.0.0",  // Cross-platform file watching
  "p-queue": "^8.0.0"     // Promise queue with concurrency control
}
```

### Usage Workflow

**Step 1: Link packages**
```bash
kb devlink apply --mode local
```

**Step 2: Start watch**
```bash
kb devlink watch
# or with filters
kb devlink watch --providers "@kb-labs/cli-*"
```

**Step 3: Edit code**
- Watch detects change → debounces → triggers build → refreshes consumers

**Step 4: See results**
- Consumers pick up changes automatically (via their own dev watchers)

### Future Enhancements

**Phase 2** (not in MVP):
- `--since <git-ref>`: Initial rebuild of changed packages
- System notifications (`--notify`)
- Transitive dependency updates (refresh B if A changes and C depends on B)
- `devlink:refresh` hooks with arguments (e.g., package name)
- Watch state persistence for resume after crash

**Phase 3** (exploration):
- Integration with HMR systems (Vite, webpack)
- Intelligent rebuild (only changed files, not full package)
- Distributed watch (multiple machines, shared lock)
- Watch metrics and analytics

## References

- **Related ADRs**:
  - [ADR-0010: Local Linking and Watch Pipeline](./0010-local-linkind-and-watch-pipelin.md) — Original concept
  - [ADR-0015: Batching of Dependency Operations](./0015-batching-of-dependency-operations.md) — Build efficiency
  - [ADR-0019: Execution Journal](./0019-execution-journal-and-apply-state-tracking.md) — State tracking
- **Implementation**: [Pull Request #TBD]
- **Documentation**: [docs/WATCH.md](../WATCH.md)
- **Dependencies**:
  - [chokidar](https://github.com/paulmillr/chokidar) — File watching
  - [p-queue](https://github.com/sindresorhus/p-queue) — Promise queue

