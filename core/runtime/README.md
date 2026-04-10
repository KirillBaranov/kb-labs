# @kb-labs/core-runtime

> DI Container + Core Features Implementations for KB Labs Platform.

## Purpose

- **PlatformContainer** - single DI container for all services
- **initPlatform()** - load adapters from kb.config.json
- **Core Implementations** - WorkflowEngine, JobScheduler, CronManager, ResourceManager

## Dependencies

```
@kb-labs/core-platform  ->  @kb-labs/core-runtime  ->  plugins
     (interfaces)            (DI + implementations)
```

## Structure

```
src/
├── container.ts        # PlatformContainer class
├── loader.ts           # initPlatform() function
├── config.ts           # PlatformConfig types
└── index.ts            # Main entry point
```

## Usage

### Platform Initialization
```typescript
import { initPlatform } from '@kb-labs/core-runtime';

await initPlatform({
  adapters: {
    analytics: '@kb-labs/analytics-adapter',
    vectorStore: '@kb-labs/mind-qdrant',
    llm: '@kb-labs/shared-openai',
  },
  core: {
    resources: { defaultQuotas: { ... } },
    jobs: { maxConcurrent: 10 },
  },
});
```

### Accessing Services
```typescript
import { platform } from '@kb-labs/core-runtime';

// Adapters (replaceable)
platform.analytics.track('event');
platform.vectorStore.search([...]);

// Core features (built-in)
platform.workflows.execute('my-workflow', input);
platform.jobs.submit({ type: 'task', payload: {...} });
```

### Configuration via kb.config.json
```json
{
  "platform": {
    "adapters": {
      "analytics": "@kb-labs/analytics-adapter",
      "vectorStore": "@kb-labs/mind-qdrant",
      "llm": "@kb-labs/shared-openai",
      "embeddings": "@kb-labs/shared-openai",
      "cache": "@kb-labs/core-redis",
      "storage": "@kb-labs/core-fs",
      "logger": "@kb-labs/core-pino",
      "eventBus": null
    },
    "core": {
      "resources": {
        "defaultQuotas": {
          "maxConcurrentWorkflows": 5,
          "maxConcurrentJobs": 10
        }
      }
    }
  }
}
```

For development/testing - set adapters to `null` to use NoOp implementations:
```json
{
  "platform": {
    "adapters": {
      "analytics": null,
      "vectorStore": null,
      "llm": null
    }
  }
}
```

## Adapters vs Core Features

| Aspect | Adapters | Core Features |
|--------|----------|---------------|
| **Replaceability** | Full (via config) | Built-in |
| **Implementation** | External packages | In core-runtime |
| **Examples** | analytics, llm | workflows, jobs |

## Graceful Degradation

All platform services have **NoOp fallback implementations** that activate automatically when adapters aren't configured. This enables:

### ✅ Development without Configuration

```typescript
// No kb.config.json? No problem! Platform initializes with NoOp adapters
await initPlatform();

// These calls work but do nothing (safe no-ops)
platform.analytics.track('event'); // NoOpAnalytics - silent
platform.vectorStore.search([...]); // MemoryVectorStore - empty results
platform.llm.complete('prompt'); // MockLLM - returns placeholder
```

### ✅ Testing without External Dependencies

```typescript
// Test without Qdrant, OpenAI, Redis, etc.
const result = await myFunction(platform.vectorStore);
// Uses MemoryVectorStore automatically
```

### ✅ Partial Configuration

```typescript
await initPlatform({
  adapters: {
    llm: '@kb-labs/shared-openai',  // Real OpenAI
    vectorStore: null,               // MemoryVectorStore fallback
    analytics: null,                 // NoOpAnalytics fallback
  },
});

// Only LLM calls hit real API, rest are no-op
await platform.llm.complete('prompt'); // → OpenAI API call
await platform.analytics.track('event'); // → silent no-op
```

### NoOp Behavior by Service

| Service | NoOp Behavior | Production Adapter |
|---------|---------------|-------------------|
| **analytics** | Silent (no tracking) | `@kb-labs/analytics-adapter` |
| **vectorStore** | In-memory (empty) | `@kb-labs/mind-qdrant` |
| **llm** | Mock responses | `@kb-labs/shared-openai` |
| **embeddings** | Deterministic vectors | `@kb-labs/shared-openai` |
| **cache** | In-memory Map | `@kb-labs/core-redis` |
| **storage** | In-memory Map | `@kb-labs/core-fs` |
| **logger** | Console output | `@kb-labs/core-pino` |
| **eventBus** | In-memory EventEmitter | Custom (future) |
| **invoke** | Throws error | Custom (future) |
| **artifacts** | In-memory storage | Custom (future) |

**Core Features** also have NoOp fallbacks but may throw errors for critical operations:
- `workflows.execute()` - throws (workflow execution is critical)
- `jobs.submit()` - executes synchronously (degraded mode)
- `resources.acquireSlot()` - always succeeds (no quota enforcement)

## API Reference

### `initPlatform(config?: PlatformConfig): Promise<PlatformContainer>`

Initialize the platform with configuration. Loads adapters and initializes core features.

### `platform: PlatformContainer`

Global singleton container. Access services through properties:

**Adapters:**
- `platform.analytics: IAnalytics`
- `platform.vectorStore: IVectorStore`
- `platform.llm: ILLM`
- `platform.embeddings: IEmbeddings`
- `platform.cache: ICache`
- `platform.storage: IStorage`
- `platform.logger: ILogger`
- `platform.eventBus: IEventBus`
- `platform.invoke: IInvoke`
- `platform.artifacts: IArtifacts`

**Core Features:**
- `platform.workflows: IWorkflowEngine`
- `platform.jobs: IJobScheduler`
- `platform.cron: ICronManager`
- `platform.resources: IResourceManager`

### `resetPlatform(): void`

Reset the platform (for testing).

## Adapter Manifest System

**NEW:** Version 1.0.0 enables multiple adapters of the same type with explicit dependencies and extension points.

### Key Features

- ✅ **Multiple adapters per type** - Run multiple loggers, storages, etc.
- ✅ **Explicit dependencies** - Declare required/optional adapter dependencies
- ✅ **Extension points** - Connect adapters via hooks (e.g., `logger.onLog()`)
- ✅ **Topological sorting** - Automatic dependency resolution
- ✅ **Circular dependency detection** - Fail-fast validation
- ✅ **Priority ordering** - Control extension execution order

### Example: Logger with Extensions

```typescript
// Configure logger + extensions
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

### Type System

**Core Adapters** - Known at compile time:
```typescript
platform.setAdapter('logger', pinoLogger); // Type: ILogger
const logger = platform.getAdapter('logger'); // ILogger | undefined
```

**Extension Adapters** - Dynamic:
```typescript
platform.setAdapter('logRingBuffer', ringBuffer);
const buffer = platform.getAdapter<ILogRingBuffer>('logRingBuffer');
```

### Documentation

See [Adapter Manifest Guide](../../docs/ADAPTER_MANIFEST_GUIDE.md) for complete documentation.

## Rules

1. **Depends only on core-platform** - no other @kb-labs/* packages
2. **Singleton pattern** - `platform` is the global instance
3. **Lazy NoOp fallback** - if adapter not configured, uses NoOp
4. **Manifest required** - all adapters must export manifest metadata

## ADR

- [ADR-0040: Platform Core Adapter Architecture](../../docs/adr/0040-platform-core-adapter-architecture.md)
- [ADR-0043: Adapter Manifest System](../../docs/adr/0043-adapter-manifest-system.md)
