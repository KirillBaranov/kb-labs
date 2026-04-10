# ADR-0015: Execution Adapters Architecture

**Status:** Accepted
**Date:** 2025-12-14
**Author:** KB Labs Team
**Context:** Plugin Runtime, Handler Execution, Multi-Protocol Support
**Tags:** `plugin-runtime`, `execution`, `adapter-pattern`, `hexagonal-architecture`, `handlers`

## Context and Problem Statement

`executePlugin()` in `plugin-runtime` is hardcoded to CLI handler signature `handler(ctx, argv, flags)`, but different handler types have different signatures:

| Type | Expected Signature | Defined via |
|------|-------------------|-------------|
| CLI | `handler(ctx, argv, flags)` | `defineCommand()` |
| REST | `handler(request, ctx)` | `defineRestHandler()` |
| Job | `handler(input, ctx)` | `defineJob()` |
| Event (future) | `handler(event, ctx)` | `defineEventHandler()` |

**Problem:** Both Jobs and REST handlers are broken because `executePlugin` always calls handlers with CLI signature.

### Example: Job Handler Failure

```typescript
// jobs-manager.ts calls:
executePlugin({ flags: { jobId, executedAt, runCount } });

// executePlugin/index.ts:107 does:
const result = await handlerFn(context, argv, flags);  // CLI signature!

// But job handler expects:
async handler(input: JobInput, ctx: PluginContext) {
  input.executedAt.toISOString();  // input = context (wrong!), ctx = argv ([])
  // TypeError: Cannot read properties of undefined (reading 'toISOString')
}
```

### Example: REST Handler Failure

```typescript
// handler.ts calls:
executePlugin({ flags: httpRequestBody });

// executePlugin does:
const result = await handlerFn(context, argv, flags);

// But REST handler expects:
async handler(request: HelloRequest, ctx: RestHandlerContext) {
  request.name;  // request = context (wrong!), ctx = argv ([])
}
```

## Decision Drivers

- **Fix broken Jobs and REST handlers** without breaking CLI
- **Follow existing adapter pattern** from ADR-0022 (Hexagonal Architecture)
- **Extensibility** for future handler types (Events, WebSocket, etc.)
- **Backward compatibility** for existing CLI commands
- **Type safety** for handler signatures

## Considered Options

### Option 1: Separate execute functions per type

```typescript
executeCliCommand(options): Promise<Result>
executeJob(options): Promise<Result>
executeRestHandler(options): Promise<Result>
```

**Pros:** Clear separation
**Cons:** Code duplication (capabilities, permissions, artifacts logic)

### Option 2: Adapter Pattern (Strategy) ✅ **CHOSEN**

```typescript
executePlugin({ executionType: 'cli' | 'job' | 'rest', ... })
// Internally uses adapter to call handler with correct signature
```

**Pros:**
- Single entry point
- Shared validation/permissions/artifacts logic
- Easy to add new types
- Type-safe

**Cons:**
- Slight indirection (minimal)

### Option 3: Universal handler signature

Force all handlers to use same signature with discriminated union payload.

**Pros:** Uniform interface
**Cons:** Breaking change for all existing handlers

## Decision

**We chose Option 2: Adapter Pattern**

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    executePlugin()                          │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 1. checkCapabilities()                              │   │
│  │ 2. validatePermissions()                            │   │
│  │ 3. loadHandler()                                    │   │
│  │ 4. adapter = getAdapter(options.executionType)      │   │
│  │ 5. input = adapter.prepareInput(options)            │   │
│  │ 6. result = adapter.invoke(handler, input, ctx)     │   │
│  │ 7. normalizeOutput(result)                          │   │
│  │ 8. writeArtifacts()                                 │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
         │              │              │              │
    ┌────▼────┐    ┌────▼────┐   ┌────▼────┐   ┌────▼────┐
    │   CLI   │    │   Job   │   │  REST   │   │  Event  │
    │ Adapter │    │ Adapter │   │ Adapter │   │ Adapter │
    └─────────┘    └─────────┘   └─────────┘   └─────────┘
```

### Interface Definition

```typescript
export type ExecutionType = 'cli' | 'job' | 'rest' | 'event';

export interface ExecutionAdapter<TInput = unknown, TOutput = unknown> {
  readonly type: ExecutionType;

  /** Prepare handler-specific input from generic options */
  prepareInput(options: ExecutePluginOptions): TInput;

  /** Invoke handler with correct signature */
  invoke(
    handler: Function,
    input: TInput,
    context: PluginContextV2
  ): Promise<TOutput>;

  /** Normalize output to unified result format */
  normalizeOutput(output: TOutput): { ok: boolean; data?: unknown };
}
```

### Adapter Implementations

**CLI Adapter** (preserves existing behavior):
```typescript
export const cliAdapter: ExecutionAdapter = {
  type: 'cli',
  prepareInput: (opts) => ({ argv: opts.argv, flags: opts.flags }),
  invoke: (handler, input, ctx) => handler(ctx, input.argv, input.flags),
  normalizeOutput: (result) => ({ ok: true, data: result }),
};
```

**Job Adapter**:
```typescript
export const jobAdapter: ExecutionAdapter = {
  type: 'job',
  prepareInput: (opts) => ({
    jobId: opts.flags.jobId,
    executedAt: new Date(opts.flags.executedAt),
    runCount: opts.flags.runCount,
  }),
  invoke: (handler, input, ctx) => handler(input, ctx),
  normalizeOutput: (result) => ({ ok: result.ok, data: result }),
};
```

**REST Adapter**:
```typescript
export const restAdapter: ExecutionAdapter = {
  type: 'rest',
  prepareInput: (opts) => ({
    request: opts.flags,
    ctx: {
      requestId: opts.context.requestId,
      pluginId: opts.context.pluginId,
      runtime: opts.context.runtime,
    },
  }),
  invoke: (handler, input) => handler(input.request, input.ctx),
  normalizeOutput: (result) => ({ ok: result.ok !== false, data: result }),
};
```

### Usage

```typescript
// CLI (default, backward compatible)
executePlugin({ context, handlerRef, argv, flags, manifest, permissions, pluginRoot });

// Job
executePlugin({ ...options, executionType: 'job' });

// REST
executePlugin({ ...options, executionType: 'rest' });
```

## Consequences

### Positive

- **Fixes Jobs and REST handlers** without breaking CLI
- **Backward compatible** - default `executionType: 'cli'` preserves current behavior
- **Extensible** - adding new execution types is trivial (create adapter, register)
- **Type-safe** - each adapter knows its handler signature
- **Follows existing patterns** - consistent with ADR-0022 adapter architecture

### Negative

- **Slight complexity** - one more abstraction layer (justified by benefits)

### Neutral

- **Migration required** for callers - jobs-manager and REST handler need to pass `executionType`

## Implementation Files

| File | Change |
|------|--------|
| `execute-plugin/adapters/types.ts` | Create: ExecutionAdapter interface |
| `execute-plugin/adapters/cli-adapter.ts` | Create: CLI adapter |
| `execute-plugin/adapters/job-adapter.ts` | Create: Job adapter |
| `execute-plugin/adapters/rest-adapter.ts` | Create: REST adapter |
| `execute-plugin/adapters/index.ts` | Create: Registry + getAdapter() |
| `execute-plugin/types.ts` | Modify: Add executionType to options |
| `execute-plugin/index.ts` | Modify: Use adapter pattern |
| `jobs-manager.ts` | Modify: Pass executionType: 'job' |
| `plugin-adapters/rest/handler.ts` | Modify: Pass executionType: 'rest' |

## Related Work

- **ADR-0022:** Platform Core Adapter Architecture (Hexagonal Architecture pattern)
- **ADR-0010:** Sandbox Execution Model
- **defineCommand/defineJob/defineRestHandler:** Handler definition helpers

## Notes

This ADR establishes execution adapters as the standard pattern for multi-protocol handler invocation. Future handler types (WebSocket, Events, GraphQL) should follow this pattern.
