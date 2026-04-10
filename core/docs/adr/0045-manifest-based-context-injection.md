# ADR-0045: Manifest-based Context Injection for Adapters

**Date:** 2026-01-11
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2026-01-11
**Tags:** [adapter-system, platform, runtime, contexts]

## Context

Prior to this decision, the platform had multiple approaches for passing runtime contexts (workspace path, analytics context, etc.) to adapters:

1. **Hardcoded universal injection** - `cwd` and `analyticsContext` were passed to ALL adapters via config, regardless of whether they needed them
2. **Legacy context parameter** - Some adapters (like FileAnalytics) accepted a separate `context` parameter in their constructor
3. **Adapter-specific logic** - Each adapter implemented its own fallback chain for accessing context data

### Problems

- **No clear contract** - Adapters didn't declare what contexts they needed
- **Wasteful injection** - All adapters received all contexts even if unused
- **Inconsistent patterns** - Mix of options-based, parameter-based, and implicit context access
- **Poor extensibility** - Adding new context types (tenant, request) would require changing all adapter initialization code
- **Unclear dependencies** - Runtime couldn't know which contexts an adapter actually used

### Requirements

- Adapters must declare required contexts in their manifest
- Runtime must inject only requested contexts
- System must be extensible for new context types
- Solution must maintain backward compatibility during migration
- Clear separation: user config vs. system-injected contexts

## Decision

We implement a **manifest-based context injection system** where:

1. **Adapters declare contexts in manifest**
   ```typescript
   export const manifest: AdapterManifest = {
     // ...
     contexts: ['workspace', 'analytics'], // Request specific contexts
   };
   ```

2. **Runtime creates context registry**
   ```typescript
   const runtimeContexts: Record<string, unknown> = {
     workspace: { cwd },
     analytics: analyticsContext,
     // Future: tenant, request, etc.
   };
   ```

3. **Loader injects only requested contexts**
   ```typescript
   // Pre-load manifest
   const module = await loadModule(modulePath);

   // Inject requested contexts
   const requestedContexts = module.manifest.contexts ?? [];
   const contexts: Record<string, unknown> = {};
   for (const ctxName of requestedContexts) {
     if (runtimeContexts[ctxName]) {
       contexts[ctxName] = runtimeContexts[ctxName];
     }
   }

   // Merge with user config
   config: { ...contexts, ...baseOptions }
   ```

4. **Adapters receive contexts via options**
   ```typescript
   export interface FileAnalyticsOptions {
     baseDir?: string;
     cwd?: string; // From workspace context
     analyticsContext?: AnalyticsContext; // From analytics context
   }

   constructor(options: FileAnalyticsOptions, deps: Deps) {
     const cwd = options.cwd ?? process.cwd(); // Fallback
     const context = options.analyticsContext ?? createFallback(cwd);
   }
   ```

### Available Contexts

| Context | Type | Content | Use Case |
|---------|------|---------|----------|
| `workspace` | `{ cwd: string }` | Working directory | File path resolution |
| `analytics` | `AnalyticsContext` | Source, runId, actor, ctx | Event enrichment |
| `tenant` (future) | `TenantContext` | Tenant ID, tier, quotas | Multi-tenancy |
| `request` (future) | `RequestContext` | Request ID, headers, user | HTTP context |

### Manifest Extension

Extended `AdapterManifest` interface:

```typescript
export interface AdapterManifest {
  // ... existing fields

  /**
   * Requested runtime contexts.
   * Available: 'workspace', 'analytics', 'tenant', 'request'
   */
  contexts?: string[];
}
```

## Consequences

### Positive

- **Explicit dependencies** - Clear contract of what contexts each adapter needs
- **Reduced coupling** - Adapters only receive what they request
- **Easy extensibility** - New contexts added to registry without changing loader logic
- **Type safety** - TypeScript validates context usage through options interfaces
- **Better testing** - Easy to mock contexts by overriding options
- **Self-documenting** - Manifest shows adapter's runtime requirements

### Negative

- **Migration effort** - Existing adapters need manifest updates
- **Potential duplication** - Contexts appear in both manifest and options interface
- **Runtime overhead** - Pre-loading manifests adds initialization time (~50-100ms for 10 adapters)
- **Breaking change** - Adapters not requesting contexts won't receive them (mitigated by fallbacks)

### Alternatives Considered

#### 1. `__runtime` object in config
```typescript
config: {
  __runtime: { cwd, analyticsContext },
  ...userOptions
}
```
**Rejected**: Special field pollutes config namespace, unclear ownership

#### 2. Separate contexts parameter to createAdapter
```typescript
createAdapter(config, deps, contexts)
```
**Rejected**: Too many parameters, breaks factory signature consistency

#### 3. Global context registry
```typescript
import { getContext } from '@kb-labs/core-runtime';
const cwd = getContext('workspace').cwd;
```
**Rejected**: Hidden dependencies, harder to test, breaks isolation

#### 4. Keep universal injection (status quo)
**Rejected**: Doesn't scale, wastes resources, unclear dependencies

## Implementation

### Phase 1: Core Infrastructure ✅

1. **Extended AdapterManifest** (`core-platform`)
   - Added `contexts?: string[]` field
   - Documented available contexts with examples

2. **Updated loader.ts** (`core-runtime`)
   - Created runtime contexts registry
   - Pre-load manifests before config building
   - Inject only requested contexts per adapter
   - Removed hardcoded `{ cwd, analyticsContext }` for all

3. **Updated FileAnalytics** (`adapters-analytics-file`)
   - Manifest: `contexts: ['workspace', 'analytics']`
   - Options: added `cwd?: string` and `analyticsContext?: AnalyticsContext`
   - Constructor: proper fallback chain with `ctx: { workspace: cwd }`

### Phase 2: Testing ✅

1. **Unit tests** (`core-runtime/src/loader.test.ts`)
   - Context registry creation
   - Manifest-based injection logic
   - Context merging with user config
   - Unknown context handling

2. **Integration tests** (`adapters-analytics-file/src/index.test.ts`)
   - Options-based context injection
   - Fallback behavior
   - Real-world REST API scenario

### Phase 3: Migration (Ongoing)

Adapters to update:
- ✅ `adapters-analytics-file` - DONE
- ⏳ `adapters-pino` - Add `contexts: ['workspace']` for log file paths
- ⏳ `adapters-sqlite` - Add `contexts: ['workspace']` for DB file paths
- ⏳ Other file-based adapters

### Phase 4: Future Enhancements

1. **Tenant context** (when multi-tenancy is needed)
   ```typescript
   runtimeContexts.tenant = { id, tier, quotas };
   ```

2. **Request context** (for HTTP-aware adapters)
   ```typescript
   runtimeContexts.request = { id, headers, user };
   ```

3. **Context validation** (optional)
   - Warn if adapter requests unknown context
   - Error if required context missing from registry

## References

- [ADR-0043: Adapter Manifest System](./0043-adapter-manifest-system.md) - Manifest structure
- [ADR-0040: Analytics V1 Auto-enrichment](./0040-analytics-v1-auto-enrichment.md) - AnalyticsContext usage
- Implementation PR: (to be added)

---

**Last Updated:** 2026-01-11
**Next Review:** 2026-04-11 (after multi-tenancy implementation)
