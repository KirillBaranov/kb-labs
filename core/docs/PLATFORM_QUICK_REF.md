# KB Labs Platform - Quick Reference

## What Goes Where?

| Need... | Package | Interface |
|---------|---------|-----------|
| Analytics | core-platform | `IAnalytics` |
| Vector search | core-platform | `IVectorStore` |
| LLM requests | core-platform | `ILLM` |
| Embeddings | core-platform | `IEmbeddings` |
| Caching | core-platform | `ICache` |
| File storage | core-platform | `IStorage` |
| Logging | core-platform | `ILogger` |
| Events | core-platform | `IEventBus` |
| Workflows | core-platform | `IWorkflowEngine` |
| Background Jobs | core-platform | `IJobScheduler` |
| Cron tasks | core-platform | `ICronManager` |
| Quotas/Resources | core-platform | `IResourceManager` |

## Pyramid Rule

```
@kb-labs/{repo}-{package}

kb-labs-core/      -> @kb-labs/core-*
kb-labs-adapters/  -> @kb-labs/adapters-*   # Production adapters!
kb-labs-mind/      -> @kb-labs/mind-*
kb-labs-plugin/    -> @kb-labs/plugin-*
kb-labs-shared/    -> @kb-labs/shared-*
kb-labs-analytics/ -> @kb-labs/analytics-*
```

## Dependency Hierarchy

```
Level 0: core-platform (0 deps)
    ↑
Level 1: core-runtime (-> core-platform)
    ↑
Level 2: adapters/* (-> core-platform)
    ↑
Level 3: plugin-runtime (-> core-runtime)
    ↑
Level 4: plugins (-> core-platform types only)
```

## How to Write a Plugin

```typescript
import { defineCommand, type PluginContext } from '@kb-labs/plugin-runtime';

export const myCommand = defineCommand({
  name: 'my-plugin:run',
  async handler(ctx: PluginContext) {
    // ALL through ctx.* - no direct imports!
    ctx.logger.info('Starting');
    await ctx.analytics.track('run');
    const results = await ctx.vectorStore.search([...]);
    await ctx.jobs.submit({ type: 'process', payload: results });
  },
});
```

## Anti-patterns

```typescript
// WRONG: direct implementation import
import { AnalyticsPipeline } from '@kb-labs/analytics-core';

// WRONG: direct SDK import
import { track } from '@kb-labs/analytics-sdk-node';

// WRONG: import from core-runtime in plugin
import { platform } from '@kb-labs/core-runtime';
```

## Correct Usage

```typescript
// Type imports from core-platform
import type { IAnalytics } from '@kb-labs/core-platform';

// Usage through ctx in plugin
async handler(ctx: PluginContext) {
  await ctx.analytics.track('event');
}

// Adapter exports createAdapter
export function createAdapter(): IAnalytics { ... }
```

## NoOp Implementations

For testing, import from `@kb-labs/core-platform/noop`:

```typescript
import {
  NoOpAnalytics,
  MemoryVectorStore,
  MockLLM,
  MockEmbeddings,
  MemoryCache,
  MemoryStorage,
  ConsoleLogger,
  MemoryEventBus,
  NoOpWorkflowEngine,
  NoOpJobScheduler,
  NoOpCronManager,
  NoOpResourceManager,
} from '@kb-labs/core-platform/noop';
```

## Configuration

**Production (kb.config.json):**
```json
{
  "platform": {
    "adapters": {
      "analytics": "@kb-labs/adapters-posthog",
      "vectorStore": "@kb-labs/adapters-qdrant",
      "llm": "@kb-labs/adapters-openai",
      "embeddings": "@kb-labs/adapters-openai",
      "cache": "@kb-labs/adapters-redis",
      "logger": "@kb-labs/adapters-pino",
      "storage": "@kb-labs/adapters-fs"
    }
  }
}
```

**Development/Testing:**
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

## Key Packages

| Package | Purpose |
|---------|---------|
| `@kb-labs/core-platform` | Interfaces only (0 deps) |
| `@kb-labs/core-runtime` | DI container + loader |
| `@kb-labs/plugin-runtime` | PluginContext factory |

## Documentation

- [ADR-0040: Platform Core Adapter Architecture](adr/0040-platform-core-adapter-architecture.md)
- [core-platform README](../packages/core-platform/README.md)
- [core-runtime README](../packages/core-runtime/README.md)
