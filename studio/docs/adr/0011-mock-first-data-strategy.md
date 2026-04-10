# ADR-0011: Mock-First Data Strategy

**Date:** 2025-11-01
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-11-03
**Tags:** [architecture, testing]

## Context

Studio needs data from multiple sources (Audit, Release, System). We considered:
- Start with real APIs vs mocks
- When to build mocks
- How to switch between mock and real data

Requirements:
- Frontend dev without backend
- Easy testing
- Smooth transition to real APIs

## Decision

**Build with mocks first, use factory pattern for API swap.**

Key aspects:
1. **Versioned contracts**: All data structures defined with TypeScript + Zod (v1.0)
2. **Deterministic fixtures**: JSON files with realistic data scenarios
3. **Mock implementations**: Classes implementing same interfaces as real APIs
4. **Factory pattern**: Single `createDataSources()` that returns mock or HTTP sources
5. **Simulated delays**: 200-600ms delays to simulate network latency

**Factory config:**
```ts
const sources = createDataSources({
  mode: 'mock' | 'http',
  baseUrl: 'http://api.example.com'
});
```

## Consequences

### Positive

- Full frontend development without backend
- Deterministic, predictable data for testing
- Easy to test error states and edge cases
- Smooth migration path to real APIs
- Parallel development of frontend and backend

### Negative

- Need to maintain fixtures alongside real data
- Must ensure mocks match contract versions
- Possible drift if contracts change

### Alternatives Considered

- **Start with real APIs**: Blocked frontend development
- **Simple stubs**: Not realistic enough
- **MSW**: Overkill, adds complexity

## Implementation

- Contracts in `packages/data-client/src/contracts/`
- Zod schemas in `packages/data-client/src/schemas/`
- Fixtures in `packages/data-client/src/mocks/fixtures/`
- Mock classes in `packages/data-client/src/mocks/`
- Factory in `packages/data-client/src/factory.ts`
- TanStack Query hooks consume interfaces, not implementations

## References

- [TanStack Query Documentation](https://tanstack.com/query/latest)
- [Zod Schema Validation](https://zod.dev/)

