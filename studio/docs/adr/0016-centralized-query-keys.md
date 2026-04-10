# ADR-0016: Centralized Query Keys

**Date:** 2025-11-01
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-11-03
**Tags:** [architecture, data]

## Context

TanStack Query requires query keys for caching. We considered:
- Inline keys in hooks vs centralized
- String keys vs object keys vs array keys
- How to ensure consistency across codebase

Goal: Predictable invalidation, type-safe keys, hierarchical structure.

## Decision

**Centralize all query keys in `query-keys.ts` with hierarchical array structure.**

Key aspects:
1. **Factory pattern**: Functions return readonly arrays
2. **Hierarchical naming**: `['audit', 'summary']`, `['audit', 'pkg', name]`
3. **Type safety**: All keys use `as const` for literal types
4. **Single source**: Import from one place
5. **Consistent pattern**: All hooks use same structure

**Structure:**
```ts
export const queryKeys = {
  audit: {
    all: ['audit'] as const,
    summary: () => [...queryKeys.audit.all, 'summary'] as const,
    pkg: (name: string) => [...queryKeys.audit.all, 'pkg', name] as const,
  },
  release: {
    all: ['release'] as const,
    preview: () => [...queryKeys.release.all, 'preview'] as const,
  },
};
```

## Consequences

### Positive

- No typos in query keys
- Easy invalidation: `invalidateQueries(['audit'])` invalidates all audit queries
- Type-safe via `as const`
- Clear structure, self-documenting
- Consistent across codebase

### Negative

- Extra file to maintain
- Small overhead for array spread

### Alternatives Considered

- **Inline keys**: Prone to typos, hard to refactor
- **String keys**: No hierarchical invalidation
- **Object keys**: Not supported by TanStack Query

## Implementation

- `query-keys.ts` in `packages/data-client/src/`
- All hooks import and use factory functions
- Invalidation uses hierarchical keys
- TypeScript infers literal types

## References

- [TanStack Query Query Keys](https://tanstack.com/query/latest/docs/react/guides/query-keys)

