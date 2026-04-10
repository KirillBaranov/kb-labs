# @kb-labs/plugin-execution-factory

Factory for creating plugin execution backends - extracted to eliminate circular dependencies.

## Purpose

This package was extracted from `@kb-labs/plugin-execution` to break a circular dependency chain:

**Before (circular):**
```
core-runtime → plugin-execution → plugin-runtime → core-runtime ❌
```

**After (no cycles):**
```
plugin-runtime → plugin-execution-factory → core-runtime ✅
```

## What's Inside

### Execution Backends

- **InProcessBackend** - Executes plugins in the same process (fast, no isolation)
- **SubprocessBackend** - Executes plugins in subprocess via IPC (isolated, secure)
- **WorkerPoolBackend** - Pool of worker processes for parallel execution

### Factory

```typescript
import { createExecutionBackend } from '@kb-labs/plugin-execution-factory';

const backend = createExecutionBackend({
  type: 'worker-pool',
  options: {
    minWorkers: 2,
    maxWorkers: 10,
    workerScript: './worker.js'
  }
});

await backend.execute(descriptor, input);
```

### Workspace Management

- **LocalWorkspaceManager** - Manages isolated workspace directories for plugins
- **WorkspaceLease** - RAII pattern for automatic workspace cleanup

## Architecture

### Worker Pool Refactoring

The original `pool.ts` (580 lines) was refactored into focused modules:

- `pool.ts` (256 lines) - Main orchestrator
- `pool-stats.ts` (106 lines) - Statistics tracking
- `pool-lifecycle.ts` (202 lines) - Worker lifecycle management
- `pool-queue.ts` (194 lines) - Request queue management
- `pool-executor.ts` (120 lines) - Execution logic

**Benefits:**
- 56% reduction in main file size
- Clear separation of concerns
- Easier to test and maintain

## Dependencies

**Core:**
- `@kb-labs/plugin-runtime` - Plugin context and execution
- `@kb-labs/plugin-contracts` - Type definitions
- `@kb-labs/core-platform` - Platform adapters
- `@kb-labs/core-ipc` - IPC transport layer

**Note:** Does NOT depend on `@kb-labs/core-runtime` to avoid circular dependencies.

## Usage in Core Runtime

Core Runtime imports this package to create execution backends:

```typescript
// core-runtime/src/loader.ts
import { createExecutionBackend } from '@kb-labs/plugin-execution-factory';

const backend = await createExecutionBackend(config);
platform.initExecutionBackend(backend);
```

## Re-exports

The original `@kb-labs/plugin-execution` package re-exports everything from this package for backward compatibility:

```typescript
export { createExecutionBackend } from '@kb-labs/plugin-execution-factory';
```

## Build

```bash
pnpm build  # Builds ESM, CJS, and TypeScript definitions
```

## Tests

Tests are located in `@kb-labs/plugin-execution` (175 tests).

## License

MIT
