# ADR-0010: Profiles v2 Architecture

**Date:** 2025-01-XX
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-01-XX
**Tags:** [architecture, configuration, profiles, monorepo]

## Context

The current profile system has several limitations:
1. **Legacy implementation**: Based on `.kb/profiles/<name>/profile.json` files and `@kb-labs/profile-schemas` package
2. **No monorepo support**: Single profile per workspace, no scope-based selection
3. **Rigid structure**: Hard-coded binding to `core-profiles`, centralized exports
4. **Poor DX**: Manual profile scaffolding, no validation, unclear inheritance
5. **Limited extensibility**: Products cannot easily define their own profile overlays

The system needs to be replaced with a robust, contracts-first, monorepo-aware profile system that:
- Supports multiple profiles per workspace
- Allows scope-based profile selection (e.g., different engines for frontend vs backend)
- Integrates seamlessly with plugin setup workflows
- Provides clear inheritance and override semantics
- Works with npm packages and presets

## Decision

### 1. Profile Model (ProfileV2)

Profiles are defined in `kb.config.json` (or `kb-labs.config.yaml`) as an array:

```typescript
interface ProfileV2 {
  id: string;                    // Unique identifier
  label?: string;                 // Human-readable name
  description?: string;           // Documentation
  extends?: string;               // Parent profile ID or npm package reference
  scopes?: ScopeV2[];            // Scope definitions
  products?: Record<string, unknown>; // Product-specific overlays
  meta?: ProfileMeta;             // Version, tags, deprecated flag
}

interface ScopeV2 {
  id: string;                     // Unique scope identifier
  label?: string;
  description?: string;
  include: string[];              // Glob patterns
  exclude?: string[];             // Glob patterns
  products?: Record<string, unknown>; // Per-scope product overlays
  default?: boolean;              // Default scope for auto-selection
}
```

**Rationale**: Array-based structure allows multiple profiles, scopes enable monorepo support, per-scope products enable different configurations per scope.

### 2. Inheritance and Overrides

- **Single parent**: `extends` references one profile (workspace or npm package)
- **Metadata merge**: Shallow merge, workspace takes precedence
- **Scopes**: Either fully inherited or fully redefined (no array merging)
- **Product overlays**: Layered merge: `upstream.products.aiReview` → `profile.products.aiReview` → `scope.products.aiReview`
- **Trace**: Records source and overridden fields for debugging

**Rationale**: Strict rules prevent "magic" behavior and make debugging easier.

### 3. Profile Resolution

Algorithm:
1. If `--profile=<id>` is explicit, use it
2. Otherwise, if a `default: true` scope exists for the product, use that profile+scope
3. Otherwise, no auto-selection; require explicit `--profile` or return bundle without profile layer

**Rationale**: Minimal algorithm avoids complexity; auto-resolve by `include[]` is deferred to future.

### 4. Bundle Integration

`loadBundle()` accepts `profileId` and `scopeId`:
- Resolves profile chain (handles `extends`, npm packages)
- Selects scope based on `cwd`, explicit `scopeId`, or `default: true`
- Passes resolved profile overlays to `getProductConfig()` as `profileLayer`
- `bundle.profile` contains full `BundleProfile` with `id`, `label`, `version`, `source`, `scopes`, `products`, `trace`

**Rationale**: Unified entry point abstracts complexity from plugins.

### 5. Product Contracts

Each product must declare a `ProductProfileOverlay` TypeScript type and Zod schema in its contracts:
- Core stores `products: Record<string, unknown>`
- Product runtime performs type casting and validation
- Products not finding an overlay use their own defaults, logging a warning

**Rationale**: Type safety and validation without core knowing product-specific structures.

### 6. Fallback Behavior

- If `profiles[]` is missing: `loadBundle()` operates without profile layer, `bundle.profile` can be `null` or stub
- If `profileId` not found: `loadBundle()` throws `ProfileNotDefinedError` with hints
- Products without overlay: Use defaults, log warning

**Rationale**: Graceful degradation ensures plugins work without profiles.

### 7. Plugin Setup Integration

Profile creation is handled by plugin-specific `setup` handlers (e.g., `kb ai-review:setup`):
- Plugins generate default profile overlay in `kb.config.json`
- `extends` or multiple profiles are advanced use cases
- No separate `kb profiles:init` command

**Rationale**: Better UX - profiles are created when needed, not as separate step.

## Consequences

### Positive

- **Monorepo support**: Multiple profiles and scopes enable different configurations per project area
- **Better DX**: Profiles defined in workspace config, validation, clear inheritance
- **Type safety**: Product contracts ensure correct overlay structure
- **Flexibility**: npm packages, presets, per-scope products
- **Observability**: Trace shows source and overridden fields
- **Plugin-friendly**: Orchestrator handles complexity, plugins get resolved config

### Negative

- **Breaking change**: Old `.kb/profiles` structure is deprecated
- **Migration required**: Existing profiles need migration to new format
- **Learning curve**: New concepts (scopes, per-scope products) need documentation
- **Complexity**: More moving parts than old system

### Risks

- **Migration complexity**: Users with existing profiles need to migrate
- **Product integration**: Products need to define contracts and read from `bundle.profile.products`
- **Performance**: Profile resolution adds overhead (mitigated by caching)

## Implementation

### Core Changes

1. **`@kb-labs/core-config`**:
   - `ProfileV2`, `ScopeV2`, `BundleProfile` types and Zod schemas
   - `readProfilesSection()` - reads `profiles[]` from config
   - `resolveProfile()` - resolves profile chain, handles `extends`, npm packages
   - `selectProfileScope()` - selects scope based on `cwd`, explicit `scopeId`, or `default: true`
   - `ProfileLayerInput` type for passing to `getProductConfig()`

2. **`@kb-labs/core-bundle`**:
   - `loadBundle()` updated to use new profile resolution
   - `BundleProfile` interface extended with new fields
   - `buildProfileLayer()` - converts `BundleProfile` to `ProfileLayerInput`

3. **`@kb-labs/core-config`** (product-config):
   - `getProductConfig()` accepts `profileLayer?: ProfileLayerInput`
   - Adds "profile" and "profile-scope" layers to merge chain
   - Layers merged in order: runtime → profile → profile-scope → preset → workspace → local → CLI

### Legacy Cleanup

1. Remove `initProfile` command and `.kb/profiles` scaffolding
2. Update documentation to remove references to old profile system
3. Update error hints to refer to `profiles[]` in `kb.config.json`

### Product Integration (Future)

1. **AI Review**: Define `AiReviewProfileSettings` in contracts, read from `bundle.profile.products.aiReview`
2. **AI Docs / AI Tests**: Similar approach
3. **Other products**: Access `bundle.profile` for logging/reporting

### Testing

1. Integration tests for `loadBundle` with profiles
2. Tests for `extends` chains, npm packages, scope selection
3. Tests for fallback behavior, validation, error handling
4. Update existing tests to use new profile structure

### Documentation

1. ADR (this document)
2. Update `docs/plugin-development.md` with profile integration guide
3. Migration guide for existing profiles

## Alternatives Considered

### Alternative 1: Keep Old System, Add Features
**Rejected**: Old system is too rigid and doesn't support monorepo use cases.

### Alternative 2: Separate Profile Files
**Rejected**: Array in `kb.config.json` is simpler and keeps everything in one place.

### Alternative 3: Deep Merge for Scopes
**Rejected**: Stricter rules (full replace) prevent confusion and make debugging easier.

### Alternative 4: Auto-resolve by `include[]` Glob Matching
**Rejected**: Deferred to future; minimal algorithm with `default: true` is sufficient for now.

### Alternative 5: Separate `kb profiles:init` Command
**Rejected**: Better UX to integrate into plugin setup handlers.

## References

- [Profiles v2 Research](./profiles-v2-research.md)
- [Profiles v2 Plan](../profiles-v2/profiles-v2-plan.md)
- [ADR-0006: Profiles Resolution Order](./0006-profiles-resolution-order-and-runtime-metadata.md)

---

**Last Updated:** 2025-01-XX  
**Next Review:** 2025-04-XX

