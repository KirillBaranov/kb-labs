# ADR-0012: TanStack Query Data Layer

**Date:** 2025-11-01
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-11-03
**Tags:** [architecture, data, ui/ux]

## Context

Studio needs robust data fetching and caching. We considered:
- TanStack Query vs SWR vs Apollo Client vs Redux
- Manual fetch + React state
- Custom caching solution

Requirements: 
- Request caching and deduplication
- Optimistic updates for mutations
- Loading/error states
- Cache invalidation after mutations

## Decision

**Use TanStack Query (React Query) for all data fetching and caching.**

Key aspects:
1. **Query hooks**: `useAuditSummary()`, `useReleasePreview()`, etc.
2. **Mutation hooks**: `useRunAudit()`, `useRunRelease()` with optimistic updates
3. **Centralized query keys**: Hierarchical naming in `query-keys.ts`
4. **Cache invalidation**: Automatic after mutations via `queryClient.invalidateQueries()`
5. **Default config**: `staleTime: 30s`, `refetchOnWindowFocus: false`

**Query key structure:**
```ts
export const queryKeys = {
  audit: {
    all: ['audit'] as const,
    summary: () => [...queryKeys.audit.all, 'summary'] as const,
    pkg: (name: string) => [...queryKeys.audit.all, 'pkg', name] as const,
  },
};
```

## Consequences

### Positive

- Automatic caching and deduplication
- Built-in loading and error states
- Easy optimistic updates
- Smart cache invalidation
- Great DevTools
- Minimal boilerplate

### Negative

- Learning curve (but small)
- Slightly heavier bundle than manual fetch

### Alternatives Considered

- **SWR**: Similar, but TanStack Query has better mutation handling
- **Apollo Client**: Overkill, designed for GraphQL
- **Redux**: Too much boilerplate for data fetching
- **Manual fetch**: Too much code, no caching

## Implementation

- Query Client setup in `App.tsx`
- Hooks in `packages/data-client/src/hooks/`
- Query keys in `packages/data-client/src/query-keys.ts`
- DevTools in development mode

## References

- [TanStack Query Documentation](https://tanstack.com/query/latest)

