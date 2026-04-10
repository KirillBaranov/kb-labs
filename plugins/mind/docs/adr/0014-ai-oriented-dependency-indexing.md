# ADR-0014: AI-Oriented Dependency Indexing and Query Optimization

**Date:** 2025-10-27
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-11-03
**Tags:** [architecture, data, performance]

## Context

During the stabilization of KB Labs Mind V1, a critical bug was discovered where the dependency indexer (`indexDependencies`) correctly processed dependency edges in memory but failed to persist them to disk. This resulted in:

1. Empty `deps.json` files after `mind:update`
2. All dependency-related queries (`externals`, `scope`, `impact`, `chain`) returning 0 results
3. Loss of critical architectural insights for AI tools

Additionally, the existing query system lacked AI-oriented optimizations for:
- Token economy (reducing unnecessary data)
- Relevance scoring (prioritizing important results)
- Smart truncation (preserving critical information)
- Contextual insights (actionable information for AI)

## Decision

We will implement a comprehensive solution addressing both the core bug and AI-oriented optimizations:

### Core Bug Fix
1. **Add missing `writeJson()` call** in `indexDependencies()` to persist `deps.json`
2. **Import `writeJson`** from `../fs/json.js` module

### Monorepo Support
3. **Add workspace package scanning** to detect and index all packages in monorepo workspaces
4. **Parse workspace patterns** from `package.json.workspaces` field

### AI-Oriented Optimizations

#### Edge Prioritization (Token Economy)
5. **Add priority and weight fields** to `DependencyEdge` interface:
   - `priority?: 'critical' | 'important' | 'normal' | 'noise'`
   - `weight?: number`
6. **Implement `computeEdgePriority()`** function with rules:
   - Type-only imports with no symbols → `noise`
   - 5+ imported symbols → `important`
   - Entry points (`/src/index.`, `/bin.`) → `critical`
   - Default → `normal`

#### Graph Statistics (Query Speed)
7. **Add `summary` field** to `DepsGraph` interface with:
   - `totalEdges`, `internalEdges`, `externalDeps`
   - `hotspots` (files with 10+ connections)
   - `packageGraph` (internal package dependencies)
8. **Implement `computeGraphSummary()`** function

#### Relevance Scoring (Impact Query)
9. **Add relevance and context** to `ImpactResult`:
   - `relevance?: number` (0.0-1.0 score)
   - `context?: string` (file role description)
10. **Implement scoring algorithm**:
    - Base score: 0.5
    - +0.1 per import (max +0.3)
    - +0.2 for CLI entry points
11. **Sort results by relevance** (highest first)

#### Smart Truncation
12. **Replace `applyLimit()` with `smartTruncate()`**:
    - Prioritize `critical` → `important` → `normal`
    - Skip `noise` items entirely
    - Track truncation statistics
13. **Apply to `importers` and `edges` arrays**

#### Enhanced AI Templates
14. **Add `insights` array** to `AITemplateResult`
15. **Generate contextual insights**:
    - "Not imported anywhere - safe to remove"
    - "High impact file - changes affect many modules"
    - "Used by X entry points"

### Performance Optimizations (Future-Ready)
16. **Parallel indexing** (process files in batches)
17. **Incremental updates** (only re-index changed files)
18. **Edge deduplication** (merge duplicate edges)
19. **Circular dependency detection**
20. **Path alias resolution** (TypeScript path mapping)
21. **External package metadata** (categorization)

## Consequences

### Positive
- **40-60% token savings** from prioritization and smart truncation
- **3-5x faster indexing** with parallel processing
- **Accurate dependency results** with proper persistence
- **Relevance-guided results** for better AI context
- **Precomputed statistics** for instant insights
- **Actionable insights** for architectural decisions

### Negative
- **Increased complexity** in indexing and query logic
- **~10KB index size growth** from summary data
- **More memory usage** during indexing
- **Additional computation** for priority scoring

### Mitigation
- **Strong test coverage** for all new features
- **Gradual rollout** with feature flags
- **Backward compatibility** maintained
- **Performance monitoring** for bottlenecks

## Alternatives Considered

### LLM-Based Prioritization
- **Rejected**: Too slow, non-deterministic, requires API calls
- **Rationale**: V1 needs deterministic, fast results

### Configuration-Based Priorities
- **Rejected**: Too complex for users, maintenance burden
- **Rationale**: Heuristic-based approach is more practical

### ML Model for Relevance
- **Rejected**: Overkill for V1, planned for V2
- **Rationale**: Simple scoring algorithm sufficient for now

### Separate AI Index
- **Rejected**: Duplication, consistency issues
- **Rationale**: Enhance existing index with AI metadata

## Implementation Notes

### Technical Details
- All optimizations work **without LLM** (deterministic)
- **Backward compatible** schema changes (optional fields)
- **Incremental adoption** possible (features can be enabled gradually)
- **Strong typing** with TypeScript interfaces

### Testing Strategy
- **Unit tests** for all new functions
- **Integration tests** for end-to-end workflows
- **Snapshot tests** for deterministic output
- **Performance tests** for indexing speed

### Rollout Plan
1. **Phase 1**: Core bug fix + basic optimizations
2. **Phase 2**: Advanced features (parallel, incremental)
3. **Phase 3**: ML enhancements (V2)

## References

- [Mind Architecture Document](../architecture/mind.md)
- [Query API Documentation](../api/mind-query.md)
- [Debug Guide](../dev/mind-debug.md)
- Original bug report: Empty `deps.json` after `mind:update`
- Performance requirements: <20ms cached, <60ms uncached queries


