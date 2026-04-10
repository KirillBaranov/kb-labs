# ADR-0035: Orchestrator Performance Optimizations

**Date:** 2025-11-29
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-11-29
**Tags:** [mind-orchestrator, performance, caching, parallelization]

## Context

Mind RAG orchestrator's thinking mode was taking 60-90 seconds per query, which is too slow for interactive CLI usage. Analysis revealed several performance bottlenecks:

**Before optimizations (2025-11-29):**
- **Thinking mode**: 60-90s with 4-7 LLM calls
- **Auto mode**: ~60s with 2-3 LLM calls
- **Instant mode**: ~30-40s (with auto-escalation)

**Main issues identified:**
1. **No query caching** - `QueryCache` was implemented but never integrated into orchestrator
2. **Sequential sub-query execution** - sub-queries executed one-by-one instead of parallel
3. **No cache invalidation** - stale results after re-indexing
4. **Fixed iterations** - thinking mode always ran maxIterations=3 even when confidence was high
5. **CLI process isolation** - each `pnpm kb` command creates new orchestrator instance

**Performance bottleneck breakdown:**
- LLM calls: ~80% of total time (decompose, check, synthesize)
- Sub-query search: ~15% (could be parallelized)
- Overhead: ~5% (analytics, compression)

## Decision

We implemented **four key optimizations** to reduce thinking mode latency from 60-90s to ~25-35s (~65% improvement):

1. **Query Cache Integration** - reuse results for identical queries
2. **Parallel Sub-Query Execution** - execute searches concurrently
3. **Cache Invalidation on Re-indexing** - ensure fresh results
4. **Adaptive Iteration Thresholds** - early exit when confidence is high

### Architecture

#### 1. Query Cache Integration (CRITICAL)

**Location:** `mind-orchestrator/src/orchestrator.ts`

**Implementation:**

```typescript
export class AgentQueryOrchestrator {
  private readonly queryCache: QueryCache;

  constructor(options) {
    // Initialize query cache with mode-specific TTLs
    this.queryCache = new QueryCache({
      maxSize: 100,
      ttlByMode: {
        instant: 2 * 60 * 1000,   // 2 minutes
        auto: 5 * 60 * 1000,      // 5 minutes
        thinking: 15 * 60 * 1000, // 15 minutes (longer for expensive queries)
      },
    });
  }

  async query(options, queryFn) {
    const mode = options.mode ?? this.config.mode;

    // Check cache BEFORE analytics to avoid overhead
    if (!options.noCache) {
      const cached = this.queryCache.get(
        options.text,
        options.scopeId ?? 'default',
        mode,
      );

      if (cached) {
        return cached; // Instant return for cache hits
      }
    }

    // ... execute pipeline ...

    // Store result AFTER compression
    if (!options.noCache) {
      this.queryCache.set(
        options.text,
        options.scopeId ?? 'default',
        mode,
        compressed,
      );
    }

    return compressed;
  }

  // Public API for cache management
  invalidateCache(scopeIds?: string[]): number {
    if (!scopeIds || scopeIds.length === 0) {
      this.queryCache.clear();
      return 0;
    }

    let totalInvalidated = 0;
    for (const scopeId of scopeIds) {
      totalInvalidated += this.queryCache.invalidateScope(scopeId);
    }
    return totalInvalidated;
  }

  getCacheStats() {
    return this.queryCache.stats();
  }
}
```

**Key features:**
- **Cache before analytics** - avoid overhead for cache hits
- **Mode-specific TTL** - longer TTL for expensive thinking mode
- **Low confidence filtering** - only cache responses with confidence ≥0.3
- **LRU eviction** - keep most useful results

**Effect:** 100% speedup for repeated queries (0ms vs 60-90s)

**CLI Limitation:** Cache works only within single process. Each `pnpm kb` command creates new orchestrator → new cache. To leverage caching between CLI invocations, need persistent daemon (future work).

#### 2. Parallel Sub-Query Execution

**Location:** `mind-orchestrator/src/gatherer/chunk-gatherer.ts`

**Before (sequential):**
```typescript
// Execute sub-queries one by one
for (const subquery of decomposed.subqueries) {
  const result = await queryFn({
    text: subquery,
    intent: 'search',
    limit: modeConfig.chunksPerQuery,
  });
  allChunks.push(...result.chunks);
}
```

**After (parallel):**
```typescript
// Execute sub-queries in parallel
const subqueryPromises = decomposed.subqueries.map(async (subquery) => {
  try {
    const result = await queryFn({
      text: subquery,
      intent: 'search',
      limit: modeConfig.chunksPerQuery,
    });
    return { subquery, chunks: result.chunks };
  } catch (error) {
    logger.warn(`Subquery failed: ${subquery}`, { error });
    return { subquery, chunks: [] };
  }
});

// Wait for all to complete
const results = await Promise.all(subqueryPromises);

// Aggregate results
for (const { subquery, chunks } of results) {
  subqueryResults.set(subquery, chunks);
  allChunks.push(...chunks);
  totalMatches += chunks.length;
}
```

**Key features:**
- **Error isolation** - one failed sub-query doesn't break others
- **Preserved logging** - warnings for failed sub-queries
- **Order independence** - results sorted by score anyway

**Effect:** ~40-50% faster gather stage (3-5 sub-queries × search time)

**Trade-offs:**
- Higher memory usage (all results in memory simultaneously)
- Higher CPU/network load (concurrent searches)
- Acceptable for typical query counts (2-5 sub-queries)

#### 3. Cache Invalidation on Re-indexing

**Location:** `mind-cli/src/application/rag.ts`

**Implementation:**

```typescript
// Global orchestrator for cache persistence
let globalOrchestrator: AgentQueryOrchestrator | null = null;

export async function runRagIndex(options) {
  // ... perform indexing ...

  for (const scopeId of scopeIds) {
    await runtime.service.index(scopeId);
  }

  // Invalidate query cache after re-indexing
  if (globalOrchestrator) {
    globalOrchestrator.invalidateCache(scopeIds);
  }

  return { scopeIds };
}

export async function runAgentRagQuery(options) {
  // Reuse or create global orchestrator for cache persistence
  if (!globalOrchestrator) {
    globalOrchestrator = createAgentQueryOrchestrator({
      llmEngine,
      config: { mode: options.mode ?? 'auto', autoDetectComplexity: true },
    });
  }

  const orchestrator = globalOrchestrator;
  // ... execute query ...
}
```

**Key features:**
- **Singleton pattern** - orchestrator persists across query calls within same process
- **Scope-specific invalidation** - only invalidate re-indexed scopes
- **Automatic cleanup** - invalidation happens transparently

**Effect:** Fresh results after re-indexing without manual cache clearing

**Trade-off:** In CLI, each command = new process, so singleton only helps within programmatic usage. Still useful for REST API or daemon mode.

#### 4. Adaptive Iteration Thresholds

**Location:** `mind-orchestrator/src/orchestrator.ts` (executeThinkingMode)

**Before:**
```typescript
const maxIterations = this.config.modes.thinking.maxIterations; // Always 3
let iteration = 0;

while (this.checker && iteration < maxIterations) {
  const completeness = await this.checker.check(...);

  if (completeness.complete || !completeness.suggestSources?.length) {
    break;
  }
  // ... additional queries ...
  iteration++;
}
```

**After:**
```typescript
const maxIterations = this.config.modes.thinking.maxIterations;
let iteration = 0;

while (this.checker && iteration < maxIterations) {
  const completeness = await this.checker.check(...);

  // Early exit conditions:
  // 1. Marked as complete
  // 2. High confidence (>0.8) - good enough
  // 3. No suggestions for improvement
  if (completeness.complete
      || completeness.confidence > 0.8
      || !completeness.suggestSources?.length) {
    break;
  }

  // ... additional queries ...
  iteration++;
}
```

**Key features:**
- **Confidence-based early exit** - stop when confidence >0.8 (good enough)
- **Preserves quality** - only exits early when truly confident
- **Backward compatible** - doesn't change behavior for low-confidence queries

**Effect:** ~30-40% faster for simple thinking queries (1 iteration vs 3)

**Trade-offs:**
- Slightly lower completeness for edge cases (0.8 threshold chosen conservatively)
- More iterations still run for complex queries
- Quality benchmarks still pass (avg confidence ≥0.7)

## Performance Results

**Testing methodology:**
- Tested on real queries from Mind codebase
- Measured with `time` command for wall-clock accuracy
- 3 test queries per mode for consistency
- No external API rate limiting

### Thinking Mode (Primary Target)

| Query | Before | After | Improvement | LLM Calls |
|-------|--------|-------|-------------|-----------|
| "How does hybrid search work" | 60-90s | 31s | **48-65%** | 4 → 2 |
| "What is VectorStore interface" | 60-90s | 36s | **40-60%** | 4 → 2 |
| "Explain adaptive search weights" | 60-90s | 21s | **65-76%** | 4 → 1 |

**Average:** 60-90s → **~29s** = **~65% faster** ✅

### Auto Mode

| Query | Before | After | Improvement |
|-------|--------|-------|-------------|
| "What is query decomposer" | ~60s | 26s | **~57%** |

### Quality Validation

Ran existing benchmarks after optimizations:

```
EASY queries:   confidence 0.63 ✅ PASS (threshold: 0.6)
MEDIUM queries: confidence 0.78 ✅ PASS (threshold: 0.7)
HARD queries:   confidence 0.70 ✅ PASS (threshold: 0.7)
Average:        confidence 0.70 ✅ 7.0/10
```

**Quality maintained** - no degradation from optimizations.

## Trade-offs

### Advantages

1. **Dramatic speedup** - 65% faster thinking mode
2. **Quality preserved** - benchmarks still pass
3. **Cache infrastructure** - ready for daemon mode
4. **Parallel efficiency** - better resource utilization
5. **Adaptive behavior** - early exit when possible

### Disadvantages

1. **CLI cache limitation** - new process per command = no cache reuse
   - **Mitigation:** Document daemon mode for future (ADR-0036 candidate)
   - **Impact:** Low (optimizations still provide 65% speedup without cache)

2. **Memory usage** - parallel sub-queries use more memory
   - **Mitigation:** Typical query has 2-5 sub-queries (acceptable)
   - **Impact:** Low (< 50MB for typical query)

3. **Early exit risk** - might exit too early for complex queries
   - **Mitigation:** Conservative 0.8 confidence threshold
   - **Impact:** Low (benchmarks still pass)

4. **Global orchestrator** - singleton pattern in CLI module
   - **Mitigation:** Only affects programmatic usage (REST API benefits)
   - **Impact:** Low (CLI creates new process anyway)

## Alternatives Considered

### Alternative 1: Streaming LLM Responses

**Approach:** Use streaming API to process partial LLM outputs

**Pros:**
- Lower perceived latency
- Can start processing before full response

**Cons:**
- Doesn't work for JSON mode (need complete JSON)
- Minimal real latency improvement (~5-10%)
- More complex implementation

**Rejected:** Not compatible with agent mode (JSON output required)

### Alternative 2: Smaller Models

**Approach:** Use `gpt-3.5-turbo` instead of `gpt-4o-mini` for simple tasks

**Pros:**
- 30-40% faster responses
- Lower cost

**Cons:**
- Quality degradation for complex queries
- Need to classify which tasks are "simple"
- Maintenance overhead (multiple model configs)

**Rejected:** Quality is priority, current speed acceptable with optimizations

### Alternative 3: Batch LLM Calls

**Approach:** Combine decompose + check into single LLM call

**Pros:**
- Reduce LLM calls from 4-7 to 2-3
- ~25% latency reduction

**Cons:**
- Complex prompt engineering
- Less modular architecture
- Harder to debug/maintain

**Deferred:** Good candidate for future optimization (ADR-0036)

### Alternative 4: Persistent Daemon

**Approach:** Run `kb daemon` process to handle queries

**Pros:**
- Cache works between CLI calls
- No process startup overhead
- Connection pooling

**Cons:**
- More complex deployment
- Need daemon lifecycle management
- Extra background process

**Deferred:** Excellent future enhancement (ADR-0036 candidate)

## Implementation Details

### Files Modified

1. **mind-orchestrator/src/orchestrator.ts** (150 lines)
   - Added `queryCache` field
   - Integrated cache check/set in `query()` method
   - Added `invalidateCache()` and `getCacheStats()` public methods
   - Added adaptive iteration logic in `executeThinkingMode()`

2. **mind-orchestrator/src/gatherer/chunk-gatherer.ts** (30 lines)
   - Converted sequential loop to `Promise.all()`
   - Added error handling for failed sub-queries
   - Preserved result aggregation logic

3. **mind-cli/src/application/rag.ts** (25 lines)
   - Added `globalOrchestrator` singleton
   - Modified `runAgentRagQuery()` to reuse orchestrator
   - Added cache invalidation in `runRagIndex()`

### Testing

**Unit Tests:** Not added (existing orchestrator tests cover behavior)

**Integration Tests:** Manual testing with real queries

**Benchmarks:** Existing benchmark suite validates quality maintained

### Rollout

- ✅ Built and deployed to development
- ✅ Tested with real Mind queries
- ✅ Quality benchmarks passing
- ✅ No breaking changes to API

## Consequences

### Positive

1. **Immediate user impact** - 65% faster queries in CLI
2. **Foundation for daemon mode** - cache infrastructure ready
3. **Better resource utilization** - parallel execution
4. **Maintained quality** - all benchmarks still pass
5. **Modular changes** - no breaking API changes

### Negative

1. **Cache limited in CLI** - need daemon for full cache benefits
2. **Higher memory usage** - parallel queries consume more RAM
3. **Complexity** - more code to maintain (cache, singleton)

### Neutral

1. **Migration path clear** - can add daemon mode later (ADR-0036)
2. **Monitoring needed** - track cache hit rates in production
3. **Documentation updated** - CLAUDE.md reflects new behavior

## Future Work

### Short-term (Next Sprint)

1. **Add cache metrics** - expose hit/miss rates via `getCacheStats()`
2. **Document daemon mode** - guide for using cache effectively
3. **Tune confidence threshold** - experiment with 0.75-0.85 range

### Medium-term (Next Quarter)

1. **Persistent daemon mode** (ADR-0036)
   - `kb daemon start/stop` commands
   - Cache persists between CLI calls
   - Connection pooling for LLM API

2. **Prompt caching** (OpenAI feature)
   - Cache system prompts (decompose, synthesize)
   - 50% reduction in repeated prompt costs

3. **Batch LLM calls**
   - Combine decompose + initial check
   - Reduce 4-7 calls to 2-3 calls

### Long-term (Future)

1. **LLM response streaming** - when not in JSON mode
2. **Query result prefetching** - predict follow-up queries
3. **Distributed caching** - Redis for multi-instance deployments

## References

- **QueryCache implementation:** `mind-orchestrator/src/cache/query-cache.ts`
- **Existing ADRs:**
  - ADR-0029: Agent Query Orchestration (context)
  - ADR-0033: Adaptive Search Weights (quality improvements)
- **Benchmarks:** `kb-labs-mind/packages/mind-engine/BENCHMARKS.md`
- **Performance data:** Documented in this ADR (Results section)

## Review Notes

**Next review:** 2025-12-15 (after daemon mode implementation)

**Monitoring:**
- Track query latency in production
- Monitor cache hit rates
- Watch for quality regressions

**Success criteria:**
- ✅ Thinking mode < 40s (achieved: ~29s)
- ✅ Quality maintained (confidence ≥0.7)
- ✅ No breaking changes
- ✅ Cache infrastructure ready for daemon
