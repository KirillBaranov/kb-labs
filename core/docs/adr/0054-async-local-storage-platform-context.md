# ADR-0054: AsyncLocalStorage for Platform Context Propagation

**Status:** Accepted  
**Date:** 2026-04-12  
**Supersedes:** Global singleton pattern (process[Symbol.for('kb.platform')])

## Context

Plugin handlers access platform services (LLM, cache, vectorStore, etc.) via hooks like `usePlatform()`, `useLLM()`, `useCache()`. These hooks read from a **global singleton** created by `core-runtime` and stored at `process[Symbol.for('kb.platform')]`.

This worked in **in-process mode** where `initPlatform()` initializes real adapters in the same process. But it broke in **worker-pool mode** because:

1. Worker processes are forked via `child_process.fork()` and never call `initPlatform()`
2. The global singleton in worker processes contains mock/noop adapters
3. Platform services are proxied via IPC (`IPCTransport` + `ChildIPCServer`), but `usePlatform()` reads the global singleton, not the IPC proxy

We built the IPC proxy infrastructure (`createProxyPlatform`, `ChildIPCServer`, governed wrapper), but `usePlatform()` bypassed all of it by reading from the wrong source.

### Attempted Fix: Patching the Global Singleton

We tried patching the global singleton with proxy adapters via `process[Symbol.for('kb.platform')].setAdapter(...)`. This failed because:

- The singleton is created lazily when `core-runtime` is first imported
- `core-runtime` is imported transitively via handler code, not by worker-script
- Timing: proxy registration happened before singleton existed, or after handler already read mock values
- Each fix was a hack on top of a hack — fragile, mode-specific, untestable

### Additional Problem: Parallel Execution in In-Process Mode

Even in in-process mode, the global singleton is wrong for parallel execution. Two handlers from different plugins executing simultaneously share the same singleton. With governed permissions (plugin A has `llm: true`, plugin B has `llm: false`), the singleton can't represent both simultaneously.

## Decision

Replace global singleton access with **AsyncLocalStorage-based context propagation**.

### Implementation

**1. `platformContext` (plugin-contracts)**

```typescript
// core/plugin-contracts/src/platform-context.ts
import { AsyncLocalStorage } from 'node:async_hooks';
import type { PlatformServices } from './platform.js';

export const platformContext = new AsyncLocalStorage<PlatformServices>();
```

Lives in `plugin-contracts` because both `plugin-runtime` (writer) and `shared-command-kit` (reader) depend on it.

**2. `runInProcess()` sets context (plugin-runtime)**

```typescript
// Wrap handler execution in platform context
const data = await platformContext.run(context.platform, () =>
  handler.execute(context, input)
);
```

**3. `usePlatform()` reads context first, falls back to global (shared-command-kit)**

```typescript
export function usePlatform() {
  return platformContext.getStore() ?? globalPlatform;
}
```

Fallback to global singleton preserves backward compatibility for code running outside handler context (CLI bootstrap, module-level initialization, tests).

## Consequences

### Positive

- **All execution modes work identically** — in-process, worker-pool, subprocess, remote
- **Per-execution platform** — each handler gets its own governed platform with correct permissions
- **No global state mutation** — no race conditions in parallel execution
- **No mode-specific hacks** — single mechanism for all modes
- **Automatic propagation** — AsyncLocalStorage propagates through async/await, Promises, event handlers automatically
- **Zero overhead for existing code** — hooks call `usePlatform()` which is already the single access point

### Negative

- **~2-5ns per getStore() call** — negligible compared to any I/O operation
- **Lost context in raw `setTimeout`/`setImmediate`** — must use `AsyncResource.bind()` if needed. In practice, handlers use async/await, not raw timers.
- **New dependency on `node:async_hooks`** — built-in module, available in all supported Node.js versions (16+)

### Neutral

- All existing hooks (`useLLM`, `useCache`, `useEmbeddings`, etc.) work without changes — they all call `usePlatform()` internally
- Global singleton remains as fallback — no breaking change for existing code
- `isPlatformConfigured()` and other helpers automatically use the context-aware platform

## Alternatives Considered

### 1. Patching global singleton in worker-script

Rejected: timing-dependent, fragile, mode-specific. See "Attempted Fix" section above.

### 2. Passing platform through function arguments

Rejected: would require changing the signature of every hook (`useLLM(platform)` instead of `useLLM()`). Breaking change for all plugin code. AsyncLocalStorage gives the same result without API changes.

### 3. Thread-local storage / context drilling through ctx

Rejected: `ctx` is already available to handlers, but hooks like `useLLM()` are designed to work without explicit ctx passing. Requiring ctx would defeat the purpose of the hook pattern.
