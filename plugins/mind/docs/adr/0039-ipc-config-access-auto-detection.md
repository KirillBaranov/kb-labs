# ADR-0039: IPC-Based Config Access with Auto-Detection

**Date:** 2025-12-11
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-12-11
**Tags:** [architecture, ipc, security, configuration]

## Context

Prior to this decision, plugins accessed configuration through two problematic approaches:

1. **Global variables**: `globalThis.__KB_RAW_CONFIG__` exposed entire `kb.config.json` to child processes
2. **Environment variables**: Config serialized as JSON strings in `KB_CONFIG_*` env vars

This approach had several critical issues:

### Security Concerns
- **No access control**: Any plugin could read entire config including other products' sensitive data
- **Violation of least privilege**: Plugins received full config when they only needed their specific section

### Architectural Problems
- **Tight coupling**: Child processes directly accessed parent's global state
- **No abstraction**: Config access implementation details leaked to all plugins
- **Hard to evolve**: Changing config format required updates across all plugins

### Developer Experience Issues
- **Boilerplate**: Every plugin needed `useConfig('product-id')` with explicit product ID
- **Error-prone**: Easy to request wrong product's config by mistake
- **Inconsistent**: Some code used `globalThis`, some used env vars, some used helpers

## Decision

We implemented **IPC-based config access with auto-detection** using the adapter pattern:

### 1. IPC Config Adapter Architecture

```
Parent Process (CLI bin)          Child Process (Plugin sandbox)
┌─────────────────────┐          ┌─────────────────────┐
│  ConfigAdapter      │          │  ConfigProxy        │
│  - Reads from       │  ◄─IPC──►│  - Forwards calls   │
│    globalThis       │          │    via Unix socket  │
│  - Scopes access    │          │  - Returns result   │
└─────────────────────┘          └─────────────────────┘
         │                                  │
         ▼                                  ▼
  kb.config.json              useConfig() → ConfigProxy
  (full config)               (product config only)
```

**Key Components:**

- **ConfigAdapter** (parent): Reads `globalThis.__KB_RAW_CONFIG__`, extracts product-specific config
- **ConfigProxy** (child): Forwards `getConfig()` calls to parent via UnixSocketTransport
- **UnixSocketServer**: Routes adapter calls between processes

### 2. Auto-Detection via Manifest

Plugins declare their config section in `manifest.v3.ts`:

```typescript
export const manifest: ManifestV2 = {
  schema: 'kb.plugin/2',
  id: '@kb-labs/mind',
  version: '0.1.0',
  configSection: 'mind', // ← NEW FIELD
  // ...
};
```

The runtime automatically infers `productId` from `manifest.configSection`:

```typescript
// OLD (explicit, error-prone)
const config = await useConfig('mind');

// NEW (auto-detected, safe)
const config = await useConfig(); // ← productId='mind' inferred from manifest
```

**Implementation Flow:**

1. CLI handler reads `manifest.configSection` → `'mind'`
2. Sets `ExecutionContext.configSection = 'mind'`
3. Serializes via IPC → child process
4. Child sets `globalThis.__KB_CONFIG_SECTION__ = 'mind'`
5. `useConfig()` reads from `globalThis.__KB_CONFIG_SECTION__`

### 3. Security Scoping

`ConfigAdapter.getConfig()` returns ONLY product-specific config:

```typescript
// kb.config.json (full config)
{
  "profiles": [
    {
      "id": "default",
      "products": {
        "mind": { "scopes": [...] },      // ← Only this returned
        "workflow": { "jobs": [...] },    // ← Inaccessible
        "plugins": { "installed": [...] } // ← Inaccessible
      }
    }
  ]
}

// useConfig() in Mind plugin → { "scopes": [...] }
// Cannot access workflow or plugins config
```

## Consequences

### Positive

✅ **Security by design**: Plugins can ONLY access their own config section, enforced at IPC layer
✅ **Clean abstraction**: Config access through well-defined adapter interface
✅ **Better DX**: No explicit product ID needed, auto-detected from manifest
✅ **Type safety**: `useConfig()` can be typed generically: `useConfig<MindConfig>()`
✅ **Cross-process compatible**: Works in both parent (tests) and child (sandbox) processes
✅ **Backward compatible**: Existing `useConfig('mind')` still works
✅ **IPC reuse**: Leverages existing UnixSocket infrastructure (no new transport)

### Negative

⚠️ **Async-only API**: `useConfig()` is now async (IPC requires async calls)
⚠️ **Slightly more complex**: Additional IPC roundtrip adds ~1-2ms latency
⚠️ **Manifest dependency**: Requires `configSection` field in manifest (optional but recommended)

### Alternatives Considered

#### Alternative 1: Keep Global Variables ❌
**Rejected** due to security concerns - no way to scope access, violates least privilege.

#### Alternative 2: Environment Variables per Product ❌
**Rejected** due to complexity - would need `KB_CONFIG_MIND`, `KB_CONFIG_WORKFLOW`, etc. Still leaks config to child env.

#### Alternative 3: Config Files per Product ❌
**Rejected** due to fragmentation - would split single `kb.config.json` into multiple files, harder to manage.

## Implementation

### Files Modified

1. **IPC Layer**:
   - `unix-socket-server.ts`: Added `case 'config'` to adapter router
   - `bulk-transfer.ts`: Fixed dynamic `require('fs')` for ESM builds

2. **Type Definitions**:
   - `plugin-manifest/types.ts`: Added `configSection?: string` to `ManifestV2`
   - `plugin-manifest/schema.ts`: Added Zod validation for `configSection`
   - `plugin-runtime/types.ts`: Added `configSection` to `ExecutionContext`
   - `core-sandbox/types.ts`: Added `configSection` to `ExecutionContext`

3. **IPC Serialization**:
   - `ipc-serializer.ts`: Added `configSection` to `SerializableContext`
   - `context-recreator.ts`: Sets `globalThis.__KB_CONFIG_SECTION__` from serialized context

4. **Adapter Implementation**:
   - `config-adapter.ts`: Parent-side adapter with scoped `getConfig()`
   - `config-proxy.ts`: Child-side proxy forwarding to parent

5. **Public API**:
   - `use-config.ts`: Made async, added auto-detection from `globalThis.__KB_CONFIG_SECTION__`
   - `sdk/helpers.ts`: Re-exported async `useConfig()`

6. **Plugin Integration**:
   - `mind-cli/manifest.v3.ts`: Added `configSection: 'mind'`
   - `mind-cli/commands/init.ts`: Changed to `await useConfig()` (no parameter)
   - `mind-cli/commands/rag-index.ts`: Changed to `await useConfig()` (no parameter)

### Migration Guide

**For Plugin Authors:**

1. Add `configSection` to your manifest:
   ```typescript
   export const manifest: ManifestV2 = {
     configSection: 'my-product', // ← Add this
     // ...
   };
   ```

2. Update `useConfig()` calls to async:
   ```typescript
   // OLD
   const config = useConfig('my-product');

   // NEW (recommended)
   const config = await useConfig(); // Auto-detects from manifest

   // NEW (explicit, still works)
   const config = await useConfig('my-product');
   ```

3. Update handler signature to async if needed:
   ```typescript
   export const run = defineCommand({
     async handler(ctx, argv, flags) { // ← Make async
       const config = await useConfig();
       // ...
     }
   });
   ```

### Testing

Verified working:
- ✅ Mind plugin auto-detects `configSection: 'mind'`
- ✅ `useConfig()` returns only Mind config (not full kb.config.json)
- ✅ IPC transport works across parent/child processes
- ✅ Backward compatibility with explicit `useConfig('mind')`
- ✅ ESM build succeeds (fixed `require('fs')` issue)

## References

- Related ADR: [ADR-0037: State Broker for Persistent Cache](./0037-state-broker-persistent-cache.md)
- IPC Architecture: UnixSocket transport pattern established in ADR-0034
- Config Structure: Profiles v2 format from ADR-0024

---

**Last Updated:** 2025-12-11
**Next Review:** 2026-01-11 (after 1 month of production usage)
