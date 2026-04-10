# ADR-0013: AI-Oriented Query API Architecture

**Date:** 2025-10-27
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-11-03
**Tags:** [architecture, api, data]

## Summary

This ADR establishes the architecture for KB Labs Mind Query, an AI-oriented query interface that transforms Mind from a static indexer into a live Knowledge Graph with structured, queryable access to indexed codebase data.

## Context and Problem Statement

KB Labs Mind currently provides static indexing capabilities but lacks:
- Structured query interface for AI consumption
- Minimal, deterministic JSON responses
- Token-optimized data delivery
- Real-time query capabilities
- AI-friendly metadata and suggestions

## Decision Drivers

- **AI Integration**: Enable seamless LLM consumption of codebase context
- **Token Economy**: Reduce payload size by 80-95% vs full context
- **Developer Experience**: Provide both CLI and programmatic interfaces
- **Performance**: Sub-50ms query latency with intelligent caching
- **Extensibility**: Support for new query types and AI enhancements

## Considered Options

### Option A: Extend Existing CLI
- **Pros**: Minimal changes, reuse existing infrastructure
- **Cons**: Tightly coupled, limited AI optimization, no programmatic API

### Option B: New Query Package (Selected)
- **Pros**: Clean separation, AI-optimized design, extensible architecture
- **Cons**: Additional complexity, new package to maintain

### Option C: HTTP API Bridge
- **Pros**: Language-agnostic, RESTful interface
- **Cons**: Additional infrastructure, complexity for MVP

## Decision Outcome

**Chosen option**: Option B - New `@kb-labs/mind-query` package

### Architecture Components

```
┌──────────────────────────────────────────────────────┐
│              KB Labs Mind Query                      │
├──────────────────────────────────────────────────────┤
│  Query Layer    │ executeQuery() + 7 query types     │
│  Cache Layer    │ QueryCache + hash validation      │
│  Loader Layer   │ IndexLoader + path registry       │
│  CLI Layer      │ mind:query command integration     │
└──────────────────────────────────────────────────────┘
```

### Core Design Principles

1. **AI-Oriented Design**
   - Stable JSON responses with zero noise
   - Self-documenting with summaries and suggestions
   - Predictable token counts and structure
   - Invariant to codebase changes

2. **Token Efficiency**
   - Path compression with stable IDs
   - Configurable result limits
   - Smart truncation with metadata
   - 80-95% reduction vs full context

3. **Deterministic Output**
   - Consistent field names and types
   - Stable top-level response shape
   - Hash-based cache invalidation
   - POSIX absolute paths

4. **Extensibility**
   - Plugin-based query system
   - New queries via file addition
   - AI mode enhancements
   - Future HTTP bridge support

### Query Types

| Query | Purpose | AI Use Case |
|-------|---------|-------------|
| `impact` | Find importers | "Who uses this module?" |
| `scope` | Dependency scope | "What's in this package?" |
| `exports` | API surface | "What does this export?" |
| `externals` | External deps | "What external libs?" |
| `chain` | Dependency chain | "Full dependency tree" |
| `meta` | Project metadata | "Project overview" |
| `docs` | Documentation | "Find relevant docs" |

### AI Mode Features

- **Summaries**: Human-readable result descriptions
- **Suggestions**: Next query recommendations
- **Path Compression**: Stable IDs instead of full paths
- **Token Optimization**: Reduced payload size
- **Self-Documentation**: Query manifest for AI tools

## Implementation Details

### Package Structure

```
packages/mind-query/
├── src/
│   ├── api/execute-query.ts      # Main query executor
│   ├── cache/query-cache.ts      # Hash-based caching
│   ├── loader/index-loader.ts    # Index loading + registry
│   ├── queries/                  # Query implementations
│   │   ├── impact.ts
│   │   ├── scope.ts
│   │   ├── exports.ts
│   │   ├── externals.ts
│   │   ├── chain.ts
│   │   ├── meta.ts
│   │   └── docs.ts
│   └── index.ts                  # Public API
├── package.json
└── README.md
```

### CLI Integration

```bash
# Basic usage
kb mind query impact packages/core/src/index.ts

# AI mode with summaries
kb mind query exports file.ts --ai-mode

# Documentation queries
kb mind query docs --type=adr

# Project metadata
kb mind query meta --product=mind
```

### Programmatic API

```typescript
import { executeQuery } from '@kb-labs/mind-query';

const result = await executeQuery('impact', { file: 'src/index.ts' }, {
  cwd: process.cwd(),
  aiMode: true,
  limit: 100
});
```

### Cache Strategy

- **Hash-based Invalidation**: `sha256(queryName|params|depsHash|apiHash)`
- **TTL Support**: Configurable cache expiration
- **Automatic Cleanup**: Keep last 100 entries
- **Silent Failures**: Caching is optional, not critical

### Performance Targets

- **Query Latency**: < 50ms (cached < 20ms)
- **Cache Hit Ratio**: > 80%
- **Payload Size**: ≤ 10KB (≤ 5KB in AI mode)
- **Token Reduction**: 90% vs full context

## Consequences

### Positive

- **AI Integration**: Seamless LLM consumption of codebase context
- **Token Economy**: Significant reduction in LLM costs
- **Developer Experience**: Both CLI and programmatic interfaces
- **Performance**: Sub-50ms queries with intelligent caching
- **Extensibility**: Easy addition of new query types

### Negative

- **Complexity**: Additional package to maintain
- **Dependencies**: Requires mind-indexer for data access
- **Learning Curve**: New API for developers to learn

### Risks and Mitigations

- **Risk**: Cache invalidation bugs
  - **Mitigation**: Hash-based validation, comprehensive tests
- **Risk**: Performance degradation
  - **Mitigation**: Benchmarking, profiling, optimization
- **Risk**: API breaking changes
  - **Mitigation**: Semantic versioning, migration guides

## Future Considerations

### Phase 2 Enhancements

- **HTTP Bridge**: REST API for autonomous agents
- **Federated Mind**: Multi-repo query aggregation
- **Semantic Layer**: Optional embeddings for free-form queries
- **LLM Router**: Automatic query selection

### Integration Opportunities

- **AI Assistants**: Direct integration with Cursor, GitHub Copilot
- **CI/CD**: Automated code analysis and reporting
- **Documentation**: Auto-generated API docs and guides
- **Monitoring**: Query performance and usage analytics

## References

- [KB Labs Mind Query Plan](./ai-query-api-implementation.plan.md)
- [AI-Oriented Design Principles](./ai-query-api-implementation.plan.md#ai-oriented-design-principles)
- [LLM Integration Flow](./ai-query-api-implementation.plan.md#llm-integration-flow)
- [Performance Targets](./ai-query-api-implementation.plan.md#performance--scaling-targets)
