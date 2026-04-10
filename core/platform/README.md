# @kb-labs/core-platform

> Pure abstractions for KB Labs platform. Zero dependencies.

## Purpose

This package contains **only interfaces** - no implementations with external dependencies.
All plugins and adapters depend on these interfaces.

## Structure

```
src/
├── adapters/           # Replaceable adapter interfaces
│   ├── analytics.ts    # IAnalytics
│   ├── vector-store.ts # IVectorStore
│   ├── llm.ts          # ILLM
│   ├── embeddings.ts   # IEmbeddings
│   ├── cache.ts        # ICache
│   ├── storage.ts      # IStorage
│   ├── logger.ts       # ILogger
│   └── event-bus.ts    # IEventBus
├── core/               # Core feature interfaces (not replaceable)
│   ├── workflow.ts     # IWorkflowEngine
│   ├── jobs.ts         # IJobScheduler
│   ├── cron.ts         # ICronManager
│   └── resources.ts    # IResourceManager
└── noop/               # NoOp + In-memory implementations
    ├── adapters/       # NoOpAnalytics, MemoryCache, etc.
    └── core/           # NoOpWorkflowEngine, etc.
```

## Usage

### In Plugins
```typescript
import type { IAnalytics, IVectorStore } from '@kb-labs/core-platform';

// Get through PluginContext
export async function handler(ctx: PluginContext) {
  await ctx.analytics.track('event');
  await ctx.vectorStore.search([...]);
}
```

### In Adapters
```typescript
import type { IAnalytics } from '@kb-labs/core-platform';

export function createAdapter(): IAnalytics {
  return {
    async track(event, props) { /* ... */ },
    async identify(userId, traits) { /* ... */ },
    async flush() { /* ... */ },
  };
}
```

### Using NoOp Implementations
```typescript
import {
  NoOpAnalytics,
  MemoryCache,
  MockLLM,
} from '@kb-labs/core-platform/noop';

// For testing
const analytics = new NoOpAnalytics();
const cache = new MemoryCache();
const llm = new MockLLM();
```

## Adapter Interfaces

| Interface | Description | NoOp Implementation |
|-----------|-------------|---------------------|
| `IAnalytics` | Event tracking and user identification | `NoOpAnalytics` |
| `IVectorStore` | Vector similarity search | `MemoryVectorStore` |
| `ILLM` | Large language model completion | `MockLLM` |
| `IEmbeddings` | Text embeddings generation | `MockEmbeddings` |
| `ICache` | Key-value caching with TTL | `MemoryCache` |
| `IStorage` | File/blob storage | `MemoryStorage` |
| `ILogger` | Structured logging | `ConsoleLogger` |
| `IEventBus` | Pub/sub event system | `MemoryEventBus` |

## Core Feature Interfaces

| Interface | Description | NoOp Implementation |
|-----------|-------------|---------------------|
| `IWorkflowEngine` | Workflow execution and management | `NoOpWorkflowEngine` (throws) |
| `IJobScheduler` | Background job scheduling | `NoOpJobScheduler` (sync) |
| `ICronManager` | Cron job registration | `NoOpCronManager` |
| `IResourceManager` | Resource quotas and limits | `NoOpResourceManager` (unlimited) |

## Rules

1. **Zero external dependencies** - only TypeScript types
2. **Export types, not implementations** - implementations in noop/
3. **Follow Pyramid Rule** - package name = core-platform

## Related Packages

- `@kb-labs/core-runtime` - DI container and core implementations
- `@kb-labs/plugin-runtime` - PluginContext using these interfaces

## ADR

See [ADR-0040: Platform Core Adapter Architecture](../../docs/adr/0040-platform-core-adapter-architecture.md)
