# Adapter Manifest System Guide

**Status:** ✅ Implemented (ADR-0043)
**Version:** 1.0.0
**Package:** `@kb-labs/core-runtime`

## Overview

The Adapter Manifest System enables multiple adapters of the same type to coexist with explicit dependency management and extension points for adapter composability.

### Key Features

- ✅ **Multiple adapters per type** - Run multiple loggers, storages, etc. side by side
- ✅ **Explicit dependencies** - Declare required and optional adapter dependencies
- ✅ **Extension points** - Connect adapters via hooks (e.g., `logger.onLog()`)
- ✅ **Topological sorting** - Automatic dependency resolution with O(V + E) complexity
- ✅ **Circular dependency detection** - Fail-fast validation during initialization
- ✅ **Priority ordering** - Control extension execution order
- ✅ **Type safety** - Separate core and extension adapter types

## Quick Start

### 1. Define Adapter Manifest

Every adapter must export a `manifest` object:

```typescript
import type { AdapterManifest } from '@kb-labs/core-platform';

export const manifest: AdapterManifest = {
  manifestVersion: '1.0.0',
  id: 'pino-logger',
  name: 'Pino Logger',
  version: '1.0.0',
  description: 'Production-ready structured logger',
  author: 'KB Labs',
  license: 'MIT',
  type: 'core',
  implements: 'ILogger',
  optional: {
    adapters: ['analytics'], // Optional dependency
  },
};
```

### 2. Create Adapter Factory

Export a `createAdapter` function:

```typescript
import type { ILogger, IAnalytics } from '@kb-labs/core-platform';

export interface PinoLoggerConfig {
  level?: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  pretty?: boolean;
}

export interface PinoLoggerDeps {
  analytics?: IAnalytics; // Matches manifest.optional.adapters
}

export function createAdapter(
  config?: PinoLoggerConfig,
  deps?: PinoLoggerDeps
): ILogger {
  return new PinoLoggerAdapter(config, deps?.analytics);
}
```

### 3. Configure Platform

In `kb.config.json`:

```json
{
  "adapters": {
    "logger": {
      "module": "@kb-labs/adapters-pino",
      "config": {
        "level": "info",
        "pretty": true
      }
    }
  }
}
```

### 4. Initialize Platform

```typescript
import { initPlatform, platform } from '@kb-labs/core-runtime';

await initPlatform({
  adapters: {
    logger: '@kb-labs/adapters-pino',
  },
});

// Use adapter
platform.logger.info('Hello world!');
```

## Core Concepts

### Adapter Types

**Core Adapters** - Known at compile time, type-safe access:

```typescript
// Type-safe core adapters
platform.setAdapter('logger', pinoLogger); // Type: ILogger
const logger = platform.getAdapter('logger'); // Returns: ILogger | undefined
```

**Extension Adapters** - Dynamic, loaded at runtime:

```typescript
// Extension adapters (generic)
platform.setAdapter('logRingBuffer', ringBuffer);
const buffer = platform.getAdapter<ILogRingBuffer>('logRingBuffer');
```

### Manifest Structure

```typescript
interface AdapterManifest {
  // Required fields
  manifestVersion: string;
  id: string;
  name: string;
  version: string;
  type: 'core' | 'extension';
  implements: string;

  // Optional metadata
  description?: string;
  author?: string;
  license?: string;
  homepage?: string;
  repository?: string;

  // Dependencies
  requires?: {
    adapters?: AdapterDependency[]; // Required adapters
    npm?: string[]; // Required npm packages
  };
  optional?: {
    adapters?: string[]; // Optional adapters
  };

  // Extension points
  extends?: {
    adapter: string; // Target adapter name
    hook: string; // Hook method name
    method: string; // Extension method name
    priority?: number; // Execution order (higher = first)
  };

  // Capabilities
  capabilities?: Record<string, boolean>;
  configSchema?: Record<string, unknown>;
}
```

### Dependency Declaration

**Short form (string):**

```typescript
requires: {
  adapters: ['db', 'cache'];
}
```

**Long form (with aliases):**

```typescript
requires: {
  adapters: [
    { id: 'db', alias: 'database' },
    { id: 'cache', alias: 'cacheStore' }
  ];
}
```

**Factory receives aliases:**

```typescript
interface LogPersistenceDeps {
  database: ISQLDatabase; // Alias from manifest
  cacheStore: ICache; // Alias from manifest
}

export function createAdapter(config: Config, deps: LogPersistenceDeps) {
  return new LogPersistenceAdapter(deps.database, deps.cacheStore);
}
```

## Extension System

### Creating Extensions

Extensions connect to core adapters via hooks:

```typescript
// Ring buffer extension
export const manifest: AdapterManifest = {
  manifestVersion: '1.0.0',
  id: 'log-ring-buffer',
  name: 'Log Ring Buffer',
  version: '1.0.0',
  type: 'extension',
  implements: 'ILogRingBuffer',
  extends: {
    adapter: 'logger', // Target adapter
    hook: 'onLog', // Hook method
    method: 'append', // Extension method
    priority: 10, // Higher = called first
  },
};

export class LogRingBufferAdapter implements ILogRingBuffer {
  // This method gets called by logger.onLog()
  append(record: LogRecord): void {
    this.buffer.push(record);
  }
}
```

### Implementing Hooks

Core adapters must implement hooks that extensions can connect to:

```typescript
export class PinoLoggerAdapter implements ILogger {
  private logCallbacks = new Set<(record: LogRecord) => void>();

  // Hook for extensions
  onLog(callback: (record: LogRecord) => void): () => void {
    this.logCallbacks.add(callback);
    return () => this.logCallbacks.delete(callback); // Unsubscribe
  }

  // Emit to all extensions
  private emitLog(record: LogRecord): void {
    for (const callback of this.logCallbacks) {
      try {
        callback(record); // Fire-and-forget
      } catch (error) {
        console.error('[Logger] Error in onLog callback:', error);
      }
    }
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.pino.info(meta ?? {}, message);
    this.emitLog({
      timestamp: Date.now(),
      level: 'info',
      message,
      fields: meta ?? {},
      source: 'unknown',
    });
  }
}
```

### Priority Ordering

Extensions are called in priority order (higher first):

```typescript
// Extension 1: priority 100
extends: { adapter: 'logger', hook: 'onLog', method: 'append', priority: 100 }

// Extension 2: priority 50
extends: { adapter: 'logger', hook: 'onLog', method: 'write', priority: 50 }

// Extension 3: priority 10 (default: 0)
extends: { adapter: 'logger', hook: 'onLog', method: 'archive', priority: 10 }

// Call order: ext1 (100) → ext2 (50) → ext3 (10)
```

## Dependency Resolution

### Topological Sort

The platform uses Kahn's algorithm to determine load order:

```typescript
// Dependency graph
db → logPersistence → logger

// Load order: [db, logPersistence, logger]
```

### Circular Dependency Detection

The system detects and rejects circular dependencies:

```typescript
// ERROR: Circular dependency
adapter A requires B
adapter B requires A

// System throws: "Circular dependency detected in adapters: A, B"
```

### Example: Log Adapters

```typescript
// Config
const configs = {
  logger: { module: '@kb-labs/adapters-pino' },
  logRingBuffer: { module: '@kb-labs/adapters-log-ring-buffer' },
  logPersistence: { module: '@kb-labs/adapters-log-sqlite' },
};

// Load order (topological sort):
// 1. logger (no dependencies)
// 2. logRingBuffer (extension to logger)
// 3. logPersistence (extension to logger)

// Extension connection (priority order):
// 1. logRingBuffer.append() → logger.onLog() (priority 10)
// 2. logPersistence.write() → logger.onLog() (priority 5)
```

## Advanced Usage

### Optional Dependencies

```typescript
export const manifest: AdapterManifest = {
  // ...
  optional: {
    adapters: ['analytics', 'metrics'],
  },
};

export function createAdapter(config: Config, deps?: Deps) {
  const logger = new Logger();

  // Optional analytics
  if (deps?.analytics) {
    logger.attachAnalytics(deps.analytics);
  }

  return logger;
}
```

### Dynamic Adapter Registration

```typescript
import { platform } from '@kb-labs/core-runtime';

// Register extension at runtime
platform.setAdapter('customExtension', myExtensionInstance);

// Check if adapter exists
if (platform.hasAdapter('customExtension')) {
  const ext = platform.getAdapter<MyExtension>('customExtension');
}

// List all adapters
const adapterNames = platform.listAdapters();
console.log(adapterNames); // ['logger', 'db', 'customExtension', ...]
```

### Unsubscribing Extensions

```typescript
const unsubscribe = platform.logger.onLog((record) => {
  console.log(record.message);
});

// Later: remove extension
unsubscribe();
```

## Testing

### Unit Tests

```typescript
import { describe, it, expect, vi } from 'vitest';
import { createAdapter, manifest } from './my-adapter.js';

describe('MyAdapter', () => {
  it('should have valid manifest', () => {
    expect(manifest.manifestVersion).toBe('1.0.0');
    expect(manifest.type).toBe('core');
    expect(manifest.implements).toBe('IMyInterface');
  });

  it('should create adapter with config', () => {
    const adapter = createAdapter({ option: 'value' });
    expect(adapter).toBeDefined();
  });

  it('should handle dependencies', () => {
    const mockDep = { method: vi.fn() };
    const adapter = createAdapter({}, { dependency: mockDep });
    // Test that adapter uses dependency
  });
});
```

### Integration Tests

```typescript
import { AdapterLoader } from '@kb-labs/core-runtime';

describe('Adapter Integration', () => {
  it('should load adapters in dependency order', async () => {
    const loader = new AdapterLoader();

    const configs = {
      db: { module: '@kb-labs/adapters-sqlite' },
      persistence: { module: '@kb-labs/adapters-log-sqlite' },
    };

    const adapters = await loader.loadAdapters(configs, loadModule);

    expect(adapters.get('db')).toBeDefined();
    expect(adapters.get('persistence')).toBeDefined();
  });

  it('should connect extensions', async () => {
    const loader = new AdapterLoader();
    // ... test extension connection
  });
});
```

## Migration Guide

### From Old System

**Before (single adapter per type):**

```typescript
import { initPlatform } from '@kb-labs/core-runtime';

await initPlatform({
  adapters: {
    logger: '@kb-labs/adapters-pino',
  },
});

// Only one logger possible
platform.logger.info('message');
```

**After (multiple adapters with manifests):**

```typescript
import { initPlatform, platform } from '@kb-labs/core-runtime';

await initPlatform({
  adapters: {
    logger: '@kb-labs/adapters-pino',
    logRingBuffer: '@kb-labs/adapters-log-ring-buffer',
    logPersistence: '@kb-labs/adapters-log-sqlite',
  },
});

// Core logger (type-safe)
platform.logger.info('message');

// Extension adapters (generic)
const buffer = platform.getAdapter<ILogRingBuffer>('logRingBuffer');
const records = buffer?.getRecords();
```

### Updating Existing Adapters

1. **Add manifest export:**

```typescript
export const manifest: AdapterManifest = {
  manifestVersion: '1.0.0',
  id: 'my-adapter',
  name: 'My Adapter',
  version: '1.0.0',
  type: 'core',
  implements: 'IMyInterface',
};
```

2. **Update factory signature:**

```typescript
// Before
export function createAdapter(config: Config): IMyInterface {
  return new MyAdapter(config);
}

// After
export function createAdapter(
  config?: Config,
  deps?: MyAdapterDeps
): IMyInterface {
  return new MyAdapter(config, deps);
}
```

3. **Add hooks (if extension point):**

```typescript
export class MyAdapter implements IMyInterface {
  private callbacks = new Set<(data: Data) => void>();

  onEvent(callback: (data: Data) => void): () => void {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }

  private emit(data: Data): void {
    for (const callback of this.callbacks) {
      try {
        callback(data);
      } catch (error) {
        console.error('[MyAdapter] Error in callback:', error);
      }
    }
  }
}
```

## Best Practices

### DO ✅

- **Use semantic versioning** for adapter versions
- **Document config schema** in manifest.configSchema
- **Declare all dependencies** (required and optional)
- **Implement graceful degradation** for optional dependencies
- **Use priority ordering** for predictable extension execution
- **Fire-and-forget async** for extension hooks (don't block)
- **Validate inputs** in factory functions
- **Handle errors** in extension callbacks

### DON'T ❌

- **Create circular dependencies** - will cause runtime errors
- **Rely on load order** - use explicit dependencies instead
- **Block on extension hooks** - use async fire-and-forget
- **Throw in extension callbacks** - wrap in try-catch
- **Mutate shared state** - extensions should be isolated
- **Skip manifest** - every adapter needs one

## Troubleshooting

### Error: Circular Dependency Detected

```
Error: Circular dependency detected in adapters: A, B
```

**Solution:** Review `requires.adapters` in manifests. Remove or refactor circular deps.

### Error: Adapter Not Found

```
Error: Adapter "logger" requires adapter "db" but it's not configured
```

**Solution:** Add missing adapter to `kb.config.json` or make it optional.

### Warning: Extension Has No Method

```
[AdapterLoader] Extension "ext" cannot connect: extension has no method "append"
```

**Solution:** Implement the method specified in `manifest.extends.method`.

### Extensions Not Called

**Check:**
1. Extension is registered in `kb.config.json`
2. `manifest.extends` points to correct adapter/hook/method
3. Core adapter implements the hook method
4. Extension method has correct signature

## API Reference

### AdapterLoader

```typescript
class AdapterLoader {
  async buildDependencyGraph(
    configs: Record<string, AdapterConfig>,
    loadModule: (path: string) => Promise<LoadedAdapterModule>
  ): Promise<DependencyGraph>;

  async loadAdapters(
    configs: Record<string, AdapterConfig>,
    loadModule: (path: string) => Promise<LoadedAdapterModule>
  ): Promise<Map<string, unknown>>;

  connectExtensions(
    adapters: Map<string, unknown>,
    graph: DependencyGraph
  ): void;
}
```

### PlatformContainer

```typescript
class PlatformContainer {
  // Core adapters (type-safe)
  setAdapter<K extends keyof CoreAdapterTypes>(
    key: K,
    instance: CoreAdapterTypes[K]
  ): void;

  // Extension adapters (generic)
  setAdapter<T = unknown>(key: string, instance: T): void;

  getAdapter<K extends keyof CoreAdapterTypes>(
    key: K
  ): CoreAdapterTypes[K] | undefined;

  getAdapter<T = unknown>(key: string): T | undefined;

  hasAdapter<K extends keyof CoreAdapterTypes>(key: K): boolean;
  hasAdapter(key: string): boolean;

  listAdapters(): string[];
}
```

## Examples

See integration tests for complete examples:
- [`__tests__/integration/log-adapters.integration.test.ts`](./src/__tests__/integration/log-adapters.integration.test.ts)
- [`__tests__/adapter-loader.test.ts`](./src/__tests__/adapter-loader.test.ts)

## Related Documentation

- **ADR-0043:** Adapter Manifest System
- **ILogger Interface:** `@kb-labs/core-platform`
- **Adapter Examples:**
  - Pino Logger: `@kb-labs/adapters-pino`
  - Log Ring Buffer: `@kb-labs/adapters-log-ring-buffer`
  - Log Persistence: `@kb-labs/adapters-log-sqlite`

## License

MIT © KB Labs
