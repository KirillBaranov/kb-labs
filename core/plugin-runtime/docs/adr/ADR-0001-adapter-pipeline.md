# ADR-0001: Slot-Based Adapter Middleware Pipeline

**Status:** Accepted  
**Date:** 2026-05-16  
**Package:** `@kb-labs/plugin-runtime`

---

## Context

The platform adapter chain had three independent, hand-maintained lists that drifted whenever a new adapter was added:

1. **Governance** (`governed.ts`) — 350-line monolith with inlined permission checks per adapter
2. **IPC proxy** (`create-proxy-platform.ts`) — explicit object with hardcoded adapter names
3. **IPC server** (`child-ipc-server.ts`) — exhaustive `switch` over adapter names

Adding a new adapter required touching all three files (plus `initializeResourceBroker` in `loader.ts`). Several adapters were silently missing from the governance layer (`artifacts`, `snapshotManager`). The EventBus was noop in worker processes.

---

## Decision

### Single source of truth: ADAPTER_REGISTRY

Every adapter has exactly one entry in `ADAPTER_REGISTRY` (`adapter-registry.ts`):

```typescript
export const ADAPTER_REGISTRY = {
  llm: {
    routerFactory: (raw, config) => new LLMRouter(raw, config),
    resourceBrokerFactory: (raw, broker) => createQueuedLLM(broker, raw),
    governance: { strategy: 'wrap', fn: wrapLlm },
    ipc: { strategy: 'proxy', create: (t) => new LLMProxy(t) },
  },
  // ... 15 more entries
} satisfies { [K in keyof Required<PlatformServices>]: AdapterDescriptor<any> };
```

The `satisfies` constraint causes a **compile error** if any key in `PlatformServices` is missing from the registry.

### Named pipeline slots

```
raw → router → post-router → resource-broker → post-resource-broker → governance
```

- `reserved=true` slots are system-only (router, resource-broker, governance)
- `reserved=false` slots are open to adapter-declared middleware
- Local `priority` within a slot — not global. Adding a new system stage never breaks existing priorities.

### Two-phase pipeline

**Phase 1 — `assemblePlatform(raw, config, broker)`** (once at startup)
- Applies `routerFactory` (e.g. LLMRouter for routing to backend)
- Applies `resourceBrokerFactory` (e.g. QueuedLLM for rate limiting)

**Phase 2 — `applyPluginGovernance(platform, permissions, pluginId, adapterMiddlewares)`** (per plugin)
- Applies adapter-declared middlewares in slot order → local priority
- Applies system governance last (always in `governance` slot)

### Bidirectional EventBus IPC

New message types added to the IPC protocol:

| Message | Direction | Purpose |
|---------|-----------|---------|
| `eventbus:subscribe` | Child → Parent | Register topic subscription |
| `eventbus:unsubscribe` | Child → Parent | Cancel subscription |
| `eventbus:push` | Parent → Child | Deliver event to subscriber |

`EventBusProxy` in worker processes replaces the previous noop implementation. `ChildIPCServer` subscribes to `platform.eventBus` and forwards events via `child.send()`.

### Adapter middleware declarations

Adapters can declare middleware in their `AdapterManifest`:

```typescript
middlewares: [
  {
    id: 'cost-tracker',
    handler: './middlewares/cost-tracker.js',
    slot: 'post-resource-broker',  // named slot (recommended)
    target: 'llm',
    priority: 10,
  }
]
```

---

## Alternatives considered

### A — Hardcoded explicit lists (current state)

**Rejected:** Three drift points. Agents forget to update all three. Proven failure mode.

### B — Global priority numbers

**Rejected:** Adding a new system stage invalidates all existing priority numbers. O(n) breakage.

### C — Whole-platform transforms only

**Rejected:** No per-adapter control. Can't add cost tracking only to LLM without wrapping everything.

### D — Hybrid slots + local priority (chosen)

Named slots provide semantic meaning and isolation. Local priority within a slot gives fine-grained control without global fragility.

---

## Consequences

### Adding a new adapter to PlatformServices

1. Add entry to `ADAPTER_REGISTRY` → compile error if forgotten
2. Add proxy/noop/local/absent IPC strategy
3. Add governance wrap function or `pass-through`

### Adding a new system stage

1. Add entry to `PIPELINE_SLOTS` (with `reserved: true`)
2. Add name to `SLOT_ORDER` at the right position
3. Add `[key]Factory` to `AdapterDescriptor` if needed

Existing adapter priorities are **not affected** — they are local to their slot.

### Writing adapter middleware

```typescript
// In adapter package: ./middlewares/cost-tracker.ts
import type { AdapterMiddlewareFn } from '@kb-labs/plugin-runtime/platform';

export const middleware: AdapterMiddlewareFn<ILLM> = (adapter, ctx) => ({
  ...adapter,
  complete: async (prompt, options) => {
    const before = Date.now();
    const result = await adapter.complete(prompt, options);
    trackCost(Date.now() - before, ctx.pluginId);
    return result;
  },
  stream: adapter.stream,
});
```

### Bootstrap wiring (deferred)

`assemblePlatform()` lives in `plugin-runtime` (Layer 1). `loader.ts` is in `core-runtime` (Layer 0). Layer 0 cannot import Layer 1 — this is a layer constraint.

**Current state:** `initializeResourceBroker()` in `loader.ts` still performs equivalent assembly. Unification requires either:
- Moving `assemblePlatform` to Layer 0 (core-runtime)
- Or wiring from a Layer 2+ caller that can import both

This is tracked as a follow-up. The governance layer (Phase 2) is fully integrated.

---

## Files

| File | Package | Role |
|------|---------|------|
| `src/platform/middleware.ts` | plugin-runtime | Types: AdapterMiddlewareFn, AdapterDescriptor, GovernanceDef, IPCDef |
| `src/platform/pipeline-slots.ts` | plugin-runtime | PIPELINE_SLOTS, SLOT_ORDER, validateMiddlewareDecl |
| `src/platform/adapter-registry.ts` | plugin-runtime | ADAPTER_REGISTRY (single source of truth) |
| `src/platform/pipeline.ts` | plugin-runtime | assemblePlatform(), applyPluginGovernance() |
| `src/platform/governed.ts` | plugin-runtime | Backward-compat shim → delegates to applyPluginGovernance() |
| `src/proxy/event-bus-proxy.ts` | core-ipc | Bidirectional EventBus proxy for workers |
| `src/ipc/child-ipc-server.ts` | core-ipc | Handles subscribe/unsubscribe, dynamic adapter dispatch |
| `src/serializable/types.ts` | core-platform | EventBusSubscribe/Unsubscribe/Push message types |
| `src/adapters/adapter-manifest.ts` | core-platform | AdapterMiddlewareDecl, AdapterManifest.middlewares |
