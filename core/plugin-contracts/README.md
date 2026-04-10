# @kb-labs/plugin-contracts

Pure TypeScript contracts for the KB Labs V3 plugin system — zero runtime dependencies.

## Overview

Defines the unified `PluginContextV3` interface and all handler signatures, API contracts, manifest types, and error classes shared across the plugin ecosystem. All handler types (CLI, REST, workflow, webhook, cron) receive the same context shape.

## Key Types

### Context

```typescript
import type { PluginContextV3, CommandHandler } from '@kb-labs/plugin-contracts';

const handler: CommandHandler = async (ctx: PluginContextV3, input) => {
  // Platform services
  const result = await ctx.platform.llm.complete({ prompt: 'Hello' });

  // Cross-plugin invocation
  await ctx.api.invoke('@kb-labs/other-plugin:command', { args });

  // State management
  await ctx.api.state.set('key', value);

  // UI output
  ctx.ui.print('Done');

  return { result };
};
```

### Handler Types

| Type | Description |
|------|-------------|
| `CommandHandler` | CLI command handler |
| `RestHandler` | HTTP route handler |
| `WorkflowHandler` | Workflow step handler |
| `WebhookHandler` | Webhook receiver |
| `CronHandler` | Scheduled job handler |

### API Interfaces

| Interface | Capabilities |
|-----------|-------------|
| `InvokeAPI` | Call other plugins |
| `StateAPI` | Key-value state per plugin |
| `ShellAPI` | Sandboxed shell execution |
| `EventsAPI` | Emit and subscribe to events |
| `LifecycleAPI` | Plugin lifecycle hooks |
| `WorkflowsAPI` | Submit and query workflows |
| `JobsAPI` | Background job management |

### Platform Services

| Interface | Description |
|-----------|-------------|
| `LLMAdapter` | LLM completion and streaming |
| `EmbeddingsAdapter` | Text → vector embeddings |
| `VectorStoreAdapter` | Semantic search |
| `CacheAdapter` | Key-value cache |
| `StorageAdapter` | Persistent file storage |
| `AnalyticsAdapter` | Event tracking |

### Manifest V3

```typescript
import type { ManifestV3 } from '@kb-labs/plugin-contracts';

// kb.plugin/3 manifest shape
const manifest: ManifestV3 = {
  schema: 'kb.plugin/3',
  id: '@my-org/my-plugin',
  commands: [{ id: 'run', description: 'Run the plugin' }],
  permissions: { invoke: ['@kb-labs/mind:*'] }
};
```

### Error Types

```typescript
import { PermissionError, TimeoutError, ValidationError } from '@kb-labs/plugin-contracts';

throw new PermissionError('invoke', '@kb-labs/other:command');
// → PluginError with code 'PERMISSION_DENIED', serializable over IPC
```

All errors are IPC-serializable with structured `code` fields.

## License

KB Public License v1.1 © KB Labs
