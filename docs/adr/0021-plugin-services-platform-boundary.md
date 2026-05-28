# ADR-0021: PluginServices / PlatformServices Type Boundary

**Date:** 2026-05-27
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2026-05-27
**Tags:** architecture, plugin-system, platform, security, types

## Context

Before this change, `PlatformServices` and `PluginServices` were the same type (`IPlatformAdapters`).
Plugins received the full platform surface via `ctx.platform` and via `AsyncLocalStorage` (`platformContext`).

This created a future leak vector: as the platform grows (e.g. adding `IServiceTransport` for
gateway-to-service communication, or other infrastructure-only adapters), those adapters would
automatically become accessible to plugin code — with no compile-time barrier.

The `applyPluginGovernance` function already filtered adapters at runtime (using `ADAPTER_REGISTRY`
keys), so the actual runtime boundary existed. But the TypeScript types did not reflect this:
`ctx.platform` was typed as `PlatformServices` (the full surface), and `platformContext.getStore()`
returned `PlatformServices | undefined`.

## Decision

Split the adapter surface into two distinct TypeScript interfaces:

```typescript
// core/platform/src/platform-adapters.ts

/** Plugin-visible adapter surface — what ctx.platform exposes. */
export interface IPluginAdapters { /* all current adapters */ }

/** Full platform surface — for services and infra. Superset of IPluginAdapters. */
export interface IPlatformAdapters extends IPluginAdapters {
  // Platform-only adapters go here (e.g. IServiceTransport — ADR-0022).
}
```

Correspondingly in `@kb-labs/plugin-contracts`:

```typescript
export type PluginServices   = IPluginAdapters;   // plugin-visible
export type PlatformServices = IPlatformAdapters; // full surface
```

Key invariants enforced by TypeScript:

- `applyPluginGovernance(platform: PlatformServices, ...): PluginServices` — governance narrows the type
- `PluginContextV3.platform: PluginServices` — plugins see the narrow type
- `JobContext.platform: PluginServices` — job handlers are also narrow
- `AsyncLocalStorage<PluginServices>` — ALS stores the narrow type; `getStore()` returns `PluginServices | undefined`
- `CreateContextOptions.platform: PlatformServices` — factory receives the full surface (correct, it runs governance)

`IPlatformAdapters` is currently empty beyond `IPluginAdapters` — it is a placeholder that will
be populated as platform-only adapters are added (first use: `IServiceTransport`, see ADR-0022).

## Consequences

### Positive

- **Compile-time enforcement**: adding a field to `IPlatformAdapters` that is not in `IPluginAdapters`
  makes it a type error to pass it to anything typed as `PluginServices`
- **Zero runtime cost**: the boundary already existed at runtime via `ADAPTER_REGISTRY` key filtering;
  this change only adds type-level enforcement
- **AsyncLocalStorage is now safe**: `platformContext.getStore()` returns `PluginServices | undefined`;
  plugin code cannot reach platform-only fields even with an unsafe cast without going through `unknown`
- **Enables IServiceTransport**: `IPlatformAdapters` is the right place for gateway-internal adapters
  that must never reach plugin context (see ADR-0022)

### Negative

- Callers that passed `PlatformServices` where `PluginServices` was expected get compile errors until
  updated (minor — mostly internal plumbing files)
- Two nearly-identical types can confuse contributors unfamiliar with the boundary

### Alternatives Considered

**`governance: 'absent'` registry strategy** — marking adapters as absent in `ADAPTER_REGISTRY` so
governance skips them. Rejected: `ADAPTER_REGISTRY` keys determine what plugins can access at runtime,
but governance doesn't strip non-registry fields from the type; the type boundary would still be wrong.
The current approach (type split) is cleaner because it makes the boundary explicit in TypeScript.

**Single `PlatformServices` type with runtime-only enforcement** — the pre-existing status quo.
Rejected: it allows future platform-only adapters to be accessed by plugin code with no compile error.

## Implementation

Files changed:

- `core/platform/src/platform-adapters.ts` — `IPlatformAdapters` → `IPluginAdapters` (plugin-visible) + `IPlatformAdapters extends IPluginAdapters` (platform-only)
- `core/platform/src/index.ts` — exports both types
- `core/plugin-contracts/src/platform.ts` — `PluginServices = IPluginAdapters`, `PlatformServices = IPlatformAdapters`
- `core/plugin-contracts/src/index.ts` — exports `PluginServices`
- `core/plugin-contracts/src/context.ts` — `ctx.platform: PluginServices`
- `core/plugin-contracts/src/job-context.ts` — `ctx.platform: PluginServices`
- `core/plugin-contracts/src/platform-context.ts` — `AsyncLocalStorage<PluginServices>`
- `core/plugin-runtime/src/platform/pipeline.ts` — `applyPluginGovernance` return type `PluginServices`
- `core/plugin-runtime/src/context/context-factory.ts` — `enrichedPlatform: PluginServices`
- `core/plugin-runtime/src/__tests__/plugin-services-boundary.test.ts` — TDD tests for the boundary

## References

- [Plan: IServiceTransport abstraction](../../.claude/plans/squishy-chasing-dove.md)
- [ADR-0001: Adapter Pipeline](../plugin-runtime/docs/adr/ADR-0001-adapter-pipeline.md)

---

**Last Updated:** 2026-05-27
