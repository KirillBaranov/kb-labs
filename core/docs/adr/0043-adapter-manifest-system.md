# ADR-0043: Adapter Manifest System

**Date:** 2025-01-10
**Status:** Accepted
**Tags:** [adapters, platform, dependency-injection, extensibility]

## Context

### Problem Statement

The current platform design assumes **one adapter per type** (one logger, one database, one storage, etc.). However, real-world use cases require **multiple adapters of the same type**:

- **Logs**: Need both ring buffer (real-time streaming) AND persistence (historical queries)
- **Storage**: Want both local disk AND S3 backup
- **LLM**: Need multiple models (GPT-4 for complex tasks, GPT-3.5 for simple queries)
- **Database**: Read replicas, write master, analytics database

Additionally, the current system lacks:
- **Explicit dependency management** between adapters
- **Extension points** for adapter composability (e.g., logger with ring buffer + persistence)
- **Load order guarantees** when adapters depend on each other
- **Type-safe multi-adapter access** beyond primary adapters

### Current Architecture

```typescript
// PlatformContainer (current)
export class PlatformContainer {
  private adapters = new Map<string, unknown>();

  // Primary adapters (single instance)
  get logger(): ILogger { ... }
  get db(): ISQLDatabase { ... }
  get storage(): IStorage { ... }

  // Generic getter (limited use)
  getAdapter<T>(key: string): T | undefined { ... }
}
```

**Problems:**
1. No way to declare dependencies between adapters
2. No automatic load order resolution
3. Extensions must manually connect to core adapters
4. Plugins cannot safely request multiple adapters of same type
5. No metadata about adapter capabilities or requirements

### Key Design Principles

Based on extensive design discussion, we established these principles:

1. **Plugins must NOT know about adapters** - they only see interfaces (`ILogger`, `ILLM`, etc.)
2. **Manifests should make adapters transparent** and help platform manage them
3. **Explicit configuration over magic** - no auto-detection or naming conventions
4. **TypeScript-only type validation** - trust the compiler, no runtime checks
5. **Keep it simple** while laying groundwork for future extensions

### Constraints

- **Backward compatibility required** - existing code must continue working
- **Performance critical** - no significant overhead in hot paths (logging, LLM calls)
- **Type safety** - full TypeScript support with proper inference
- **IPC transparency** - extensions work across process boundaries (for subprocess execution)

## Decision

We will implement a **Manifest-based Adapter System** with explicit dependency management and extension points.

### Adapter Manifest Schema

Every adapter exports a manifest describing its identity, dependencies, and capabilities:

```typescript
export interface AdapterManifest {
  // Manifest version for compatibility checking
  manifestVersion: string;  // "1.0.0"

  // Identity
  id: string;               // "log-persistence"
  name: string;             // "SQLite Log Persistence"
  version: string;          // "1.0.0"
  description?: string;
  author?: string;
  license?: string;
  homepage?: string;

  // Classification
  type: 'core' | 'extension' | 'proxy';
  implements: string;       // "ILogPersistence" | "ILogger"

  // Dependencies
  requires?: {
    adapters?: Array<string | { id: string; alias?: string }>;
    platform?: string;      // ">= 1.0.0"
  };

  optional?: {
    adapters?: string[];
  };

  // Extension point
  extends?: {
    adapter: string;        // "logger"
    hook: string;           // "onLog"
    method: string;         // "write"
    priority?: number;      // default: 0, higher = called first
  };

  // Capabilities
  capabilities?: {
    streaming?: boolean;
    batch?: boolean;
    search?: boolean;
    transactions?: boolean;
    custom?: Record<string, unknown>;
  };
}
```

### Adapter Factory Function

Adapters export a factory function that receives dependencies:

```typescript
// Pino Logger (core adapter)
export const manifest: AdapterManifest = {
  manifestVersion: '1.0.0',
  id: 'pino-logger',
  name: 'Pino Logger',
  version: '1.0.0',
  type: 'core',
  implements: 'ILogger',
  optional: { adapters: ['analytics'] },
  capabilities: { streaming: true }
};

export function createAdapter(
  config: PinoConfig,
  deps: { analytics?: IAnalytics }
): ILogger {
  const logger = new PinoAdapter(config);

  // Optional analytics integration
  if (deps.analytics) {
    logger.onLog((record) => {
      deps.analytics.track('log', { level: record.level });
    });
  }

  return logger;
}
```

```typescript
// Ring Buffer (extension adapter)
export const manifest: AdapterManifest = {
  manifestVersion: '1.0.0',
  id: 'log-ringbuffer',
  name: 'Log Ring Buffer',
  version: '1.0.0',
  type: 'extension',
  implements: 'ILogRingBuffer',
  extends: {
    adapter: 'logger',
    hook: 'onLog',
    method: 'append',
    priority: 10
  },
  capabilities: { streaming: true }
};

export function createAdapter(
  config: RingBufferConfig,
  deps: {}
): ILogRingBuffer {
  return new RingBufferAdapter(config);
}
```

```typescript
// SQLite Persistence (extension with dependency)
export const manifest: AdapterManifest = {
  manifestVersion: '1.0.0',
  id: 'log-persistence',
  name: 'SQLite Log Persistence',
  version: '1.0.0',
  type: 'extension',
  implements: 'ILogPersistence',
  requires: {
    adapters: [{ id: 'db', alias: 'database' }],
    platform: '>= 1.0.0'
  },
  extends: {
    adapter: 'logger',
    hook: 'onLog',
    method: 'write',
    priority: 5
  },
  capabilities: { batch: true, search: true, transactions: true }
};

export function createAdapter(
  config: PersistenceConfig,
  deps: { database: ISQLDatabase }
): ILogPersistence {
  return new LogPersistenceAdapter(config, deps.database);
}
```

### Dependency Resolution

The platform uses **topological sort (Kahn's algorithm)** to determine correct load order:

```typescript
// AdapterLoader
export class AdapterLoader {
  async loadAdapters(config: AdaptersConfig): Promise<Map<string, unknown>> {
    // 1. Build dependency graph from manifests
    const graph = this.buildDependencyGraph(config);

    // 2. Topological sort to determine load order
    const loadOrder = this.topologicalSort(graph);

    // 3. Load adapters in dependency order
    const adapters = new Map<string, unknown>();
    for (const name of loadOrder) {
      const adapter = await this.loadAdapter(name, config, adapters);
      adapters.set(name, adapter);
    }

    // 4. Connect extensions to core adapters
    await this.connectExtensions(adapters, graph);

    return adapters;
  }

  private topologicalSort(graph: DependencyGraph): string[] {
    // Kahn's algorithm: O(V + E)
    // Automatically detects circular dependencies
  }

  private async connectExtensions(
    adapters: Map<string, unknown>,
    graph: DependencyGraph
  ): Promise<void> {
    // For each extension, call target.hook(extension.method)
    // Example: logger.onLog(ringBuffer.append)
  }
}
```

### Extension Connection

Extensions are automatically connected after all adapters are loaded:

```typescript
// Extension connection logic
for (const [name, adapter] of adapters.entries()) {
  const manifest = graph.manifests.get(name);

  if (manifest?.extends) {
    const { adapter: targetName, hook, method, priority } = manifest.extends;
    const target = adapters.get(targetName);

    if (!target || typeof target[hook] !== 'function') {
      logger.warn(`Extension ${name} cannot connect: ${targetName}.${hook} not found`);
      continue;
    }

    // Connect: logger.onLog(ringBuffer.append)
    target[hook]((data: unknown) => {
      try {
        adapter[method](data); // Fire-and-forget
      } catch (error) {
        logger.error(`Extension ${name}.${method} failed:`, error);
      }
    });
  }
}
```

### Platform Container Updates

The `PlatformContainer` provides both primary adapters (for plugins) and generic access (for platform):

```typescript
export class PlatformContainer {
  private adapters = new Map<string, unknown>();

  // Primary adapters (backward compatible, for plugins)
  get logger(): ILogger {
    return this.adapters.get('logger') as ILogger ?? new ConsoleLogger();
  }

  get db(): ISQLDatabase {
    return this.adapters.get('db') as ISQLDatabase ?? new NoOpDatabase();
  }

  // Generic adapter registry (for platform/CLI/REST API only)
  getAdapter<T = unknown>(name: string): T | undefined {
    return this.adapters.get(name) as T | undefined;
  }

  hasAdapter(name: string): boolean {
    return this.adapters.has(name);
  }

  listAdapters(): string[] {
    return Array.from(this.adapters.keys());
  }
}
```

### Configuration Example

```json
{
  "adapters": {
    "logger": {
      "module": "@kb-labs/adapters-pino",
      "config": { "level": "info" }
    },
    "logRingBuffer": {
      "module": "@kb-labs/adapters-log-ringbuffer",
      "config": { "maxSize": 1000, "ttl": 3600000 }
    },
    "logPersistence": {
      "module": "@kb-labs/adapters-log-sqlite",
      "config": {
        "database": "${platform.db}",
        "batchSize": 100,
        "flushInterval": 5000
      }
    }
  }
}
```

### Key Architectural Decisions

1. **Manifest validation: Hybrid** ✅
   - Core adapters: Fail hard if manifest invalid
   - Extension adapters: Warn and skip

2. **Version compatibility: Semver range** ✅
   - Support `^1.0.0` (any 1.x.x compatible)
   - Fail on major version mismatch

3. **Extension priority: Default = 0** ✅
   - Higher number = called first
   - Conflicts resolved by registration order

4. **Dependency aliases: Optional** ✅
   - Short form: `requires: { adapters: ['db'] }`
   - Explicit alias: `requires: { adapters: [{ id: 'db', alias: 'database' }] }`
   - Default: alias = id

5. **Backward compatibility: Require manifests immediately** ✅
   - All adapters must have manifests from day 1
   - Add manifests to existing adapters as part of implementation

6. **Extension method: Explicit only** ✅
   - Must specify `method` in manifest
   - No auto-detection magic

7. **Multiple adapters naming: Free naming** ✅
   - Convention: `logger` (primary), `logRingBuffer`, `logPersistence`
   - Access via `platform.getAdapter<T>(name)`

8. **Config structure: Keep current** ✅
   - Flat structure: `adapters` + `adapterOptions`
   - Less nesting, easier to read

9. **Topological sort: Kahn's algorithm** ✅
   - O(V + E) complexity
   - Automatic cycle detection

10. **Circular dependencies: Fail hard** ✅
    - Throw error immediately
    - Design error, should not proceed

11. **Missing required dependency: Fail hard** ✅
    - Required deps are critical
    - Optional deps can be missing (skip with warning)

12. **Async extensions: Fire-and-forget** ✅
    - Don't block logging on slow extensions
    - Extensions handle their own errors

13. **Extension connection timing: After all adapters loaded** ✅
    - Load all → Connect extensions → Ready

14. **Error logging: Console + logger fallback** ✅
    - Try platform.logger first
    - Fall back to console.error

15. **Type validation: TypeScript only** ✅
    - Trust the compiler
    - No runtime type checking

## Consequences

### Positive

1. **Explicit dependency management** - No more guessing load order or missing dependencies
2. **Type-safe multi-adapter support** - TypeScript knows which adapters are available
3. **Automatic extension connection** - No manual wiring in initialization code
4. **Backward compatible** - Existing code continues working unchanged
5. **Future-proof** - Easy to add new adapter types and capabilities
6. **Circular dependency prevention** - Fail fast on design errors
7. **Clear separation of concerns** - Plugins see interfaces, platform manages implementations
8. **Performance optimized** - Fire-and-forget extensions don't block critical paths
9. **Flexible naming** - No rigid conventions, just conventions for common cases
10. **Self-documenting** - Manifests describe capabilities and requirements

### Negative

1. **Added complexity** - Developers must write manifests for all adapters
2. **Manifest maintenance** - Version bumps, capability changes require manifest updates
3. **Potential for misconfiguration** - Wrong dependencies or extension points cause runtime errors
4. **Learning curve** - Developers need to understand topological sort and dependency resolution
5. **Debugging harder** - Extension connection failures can be subtle

### Alternatives Considered

**Option 1: Named Adapter Collections**
```typescript
platform.logAdapters?.ringBuffer?.append(log);
platform.logAdapters?.persistence?.write(log);
```
- ❌ Not dynamic (must pre-define all names in interface)
- ❌ Verbose for many adapters

**Option 2: Pure Adapter Registry (No Manifests)**
```typescript
const ringBuffer = platform.getAdapter<ILogRingBuffer>('logRingBuffer');
```
- ✅ Simple and flexible
- ❌ No dependency management
- ❌ No automatic extension connection
- ❌ Manual load order management

**Option 3: Auto-detection via Naming Conventions**
```typescript
// Any adapter with "extends" in name auto-connects
@kb-labs/adapters-logger-ringbuffer-extends
```
- ❌ Magic behavior (violates explicit configuration principle)
- ❌ Brittle and error-prone

**Option 4: Runtime Type Validation**
```typescript
if (!validateInterface(adapter, 'ILogger')) {
  throw new Error('Invalid adapter type');
}
```
- ❌ Expensive at runtime
- ❌ TypeScript already provides compile-time safety

## Implementation

### Implementation Plan (6 Phases, ~21 hours)

**Phase 1: ADR** (1 hour) ✅
- [x] Write ADR document (this file)

**Phase 2: Core Platform Types** (2 hours)
- [ ] Create `AdapterManifest` interface in `@kb-labs/core-platform`
- [ ] Add `onLog` hook to `ILogger` interface
- [ ] Write tests for manifest validation

**Phase 3: Update Existing Adapters** (5 hours)
- [ ] Add manifest + onLog to Pino adapter
- [ ] Add manifest to ring buffer adapter
- [ ] Add manifest to SQLite persistence adapter

**Phase 4: Core Runtime Loader** (8 hours)
- [ ] Implement `AdapterLoader` with dependency resolution
- [ ] Implement topological sort (Kahn's algorithm)
- [ ] Implement extension connection logic
- [ ] Update `PlatformContainer` with `getAdapter()` registry
- [ ] Write comprehensive tests

**Phase 5: Integration Tests** (3 hours)
- [ ] Test logger + ring buffer + persistence integration
- [ ] Test circular dependency detection
- [ ] Test missing dependency handling
- [ ] Test extension priority ordering

**Phase 6: Documentation** (2 hours)
- [ ] Update adapter development guide
- [ ] Add manifest examples
- [ ] Document migration path for existing adapters

### Breaking Changes

**None** - This is fully backward compatible:
- Existing primary adapters (`platform.logger`, `platform.db`) work unchanged
- New `getAdapter()` API is opt-in
- Manifests added to all adapters in this PR

### Migration Path

For adapter developers:
1. Add `manifest` export to adapter module
2. Update `createAdapter()` to accept `deps` parameter
3. Test dependency resolution and extension connection

For platform users:
- No changes required, but can now use multi-adapter features

## References

- [Implementation Plan](../../../docs/ADAPTER-MANIFEST-IMPLEMENTATION-PLAN.md)
- [Multi-Adapter Support Design](../../../docs/MULTI-ADAPTER-SUPPORT-DESIGN.md)
- [ADR-0022: Platform Core Adapter Architecture](./0022-platform-core-adapter-architecture.md)
- [ADR-0002: Plugins and Extensibility](./0002-plugins-and-extensibility.md)
