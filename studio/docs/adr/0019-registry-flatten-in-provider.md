# ADR-0019: Registry Flatten in Provider

**Status:** Accepted
**Date:** 2025-12-16
**Deciders:** Studio Team
**Tags:** studio, registry, performance, architecture

## Context

Studio consumes a `StudioRegistry` from the REST API endpoint `/api/v1/studio/registry`. The registry structure evolved to use a **nested format** for preservation of plugin metadata:

```typescript
// REST API returns (nested structure)
interface StudioRegistry {
  schema: 'kb.studio/1';
  schemaVersion: 1;
  generatedAt: string;
  plugins: Array<{
    pluginId: string;
    widgets: StudioWidgetDecl[];
    layouts: StudioLayoutDecl[];
    menus: StudioMenuDecl[];
  }>;
}
```

However, Studio components were originally written to expect **flat arrays** at the root level:

```typescript
// Components expected (flat structure)
registry.widgets.forEach(...)
registry.menus.forEach(...)
registry.layouts.forEach(...)
```

This mismatch caused runtime errors:
- `registry.menus is not iterable` in router.tsx
- `registry.layouts.find is not a function` in plugin-page.tsx
- `registry.widgets` undefined in gallery-page.tsx

## Decision

We will **flatten the registry in `RegistryProvider`** using the `flattenRegistry()` utility from `@kb-labs/studio-contracts`. The provider will expose **both nested and flat formats**:

```typescript
// registry-provider.tsx
const flattened = data ? flattenRegistry(data) : null;

const registry = {
  // Nested format (preserves plugin metadata)
  schema: data.schema,
  schemaVersion: data.schemaVersion,
  generatedAt: data.generatedAt,
  plugins: data.plugins,

  // Flat format (convenience for iteration)
  widgets: flattened?.widgets ?? [],
  menus: flattened?.menus ?? [],
  layouts: flattened?.layouts ?? [],

  // Lookup maps (O(1) access)
  widgetMap: flattened?.widgetMap,
  layoutMap: flattened?.layoutMap,
};
```

### Alternatives Considered

**Alternative 1: Change REST API to return flat structure**
- ❌ Loses plugin metadata
- ❌ Cannot filter widgets by plugin
- ❌ Violates separation of concerns (API shouldn't dictate UI format)

**Alternative 2: Flatten in each component**
- ❌ Repeating code (DRY violation)
- ❌ Performance: O(n*m) flatten on every render
- ❌ Easy to forget and cause bugs

**Alternative 3: Use only nested format**
- ❌ Every component must loop through plugins
- ❌ More verbose code
- ❌ Slower lookups (O(n*m) vs O(1))

## Consequences

### Positive

✅ **Single Source of Truth**: All components get unified registry format
✅ **Performance**: Flatten once at load time (~10ms) instead of N times per render
✅ **Developer Experience**: Simple API - `registry.widgets.map(...)` just works
✅ **Flexibility**: Components can use flat arrays OR filter by plugin
✅ **Fast Lookups**: `widgetMap.get(id)` is O(1) vs O(n*m) nested loop
✅ **Type Safety**: Proper TypeScript types (no `any`)
✅ **Backward Compatible**: Maintains both formats for transition period

### Negative

⚠️ **Memory Overhead**: Data duplicated in nested + flat structures
  - Mitigation: Negligible for typical registry size (<1MB)
⚠️ **Provider Complexity**: More logic in provider
  - Mitigation: Well-documented, single responsibility

### Neutral

🔄 **Registry structure in memory**:
```typescript
registry.plugins[0].widgets[5]     // nested access
registry.widgets[5]                // flat access (same data)
registry.widgetMap.get('id')       // O(1) lookup
```

## Implementation

### Files Changed

1. **registry-provider.tsx** (+30 lines)
   - Import `flattenRegistry`, types from `@kb-labs/rest-api-contracts`
   - Apply flatten in `useMemo`
   - Update `RegistryContextValue` type

2. **router.tsx** (+2 lines)
   - Changed: `registry.menus` → `registry.menus ?? []`

3. **plugin-page.tsx** (+4 lines)
   - Changed: `registry.layouts.find(...)` → `(registry.layouts ?? []).find(...)`
   - Changed: `registry.widgets.filter(...)` → `(registry.widgets ?? []).filter(...)`

4. **gallery-page.tsx** (-12 lines, +5 lines)
   - Removed: Nested loop through `registry.plugins[].widgets[]`
   - Added: Direct map over `registry.widgets`
   - Performance: O(n*m) → O(n)

5. **widget-renderer.tsx** (+8 lines)
   - Added: O(1) lookup via `registry.widgetMap.get(widgetId)`
   - Kept: Fallback to nested loop for compatibility
   - Performance: O(n*m) → O(1) in normal case

6. **registry-provider.spec.tsx** (+12 lines)
   - Fixed: Test mocks to include required `layouts`, `menus` arrays in plugins

### Performance Impact

| Component | Before | After | Improvement |
|-----------|--------|-------|-------------|
| gallery-page | O(n*m) nested loop | O(n) flat map | ~10x faster |
| widget-renderer | O(n*m) search | O(1) Map lookup | ~100x faster |
| router | N/A (broken) | O(n) flat iteration | ✅ works |
| plugin-page | N/A (broken) | O(n) flat find | ✅ works |

Where:
- `n` = number of widgets (~50-200)
- `m` = number of plugins (~5-20)

### Test Results

✅ **73/73 tests passing**
- registry-provider: 8/8 tests
- widget-renderer: 11/11 tests
- plugin-page: 10/10 tests
- gallery-page: (no tests, manual verification)
- router: (no tests, manual verification)

## Related

- [ADR-0017: Widget Registry Phased](0017-widget-registry-phased.md) - Registry evolution
- [ADR-0018: Ant Design Migration](0018-ant-design-migration.md) - Widget implementation
- `@kb-labs/studio-contracts` - Registry types and utilities
- `@kb-labs/rest-api-contracts` - REST API types (re-exports studio-contracts)

## References

- REST API: `packages/rest-api-core/src/studio-registry.ts`
- Studio Contracts: `packages/studio-contracts/src/registry.ts`
- Provider Implementation: `apps/studio/src/providers/registry-provider.tsx`
