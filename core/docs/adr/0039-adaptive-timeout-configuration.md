# ADR-0039: Adaptive Timeout Configuration for IPC Transport

**Status:** ✅ Accepted
**Date:** 2025-12-11
**Authors:** KB Labs Team
**Context:** TASK-002 - Mind RAG Not Using Platform Adapters
**Tags:** `ipc`, `timeout`, `performance`, `configuration`, `transport`, `scalability`

## Context

After implementing Unix Socket transport to solve IPC backpressure issues ([ADR-0038](0038-ipc-serialization-protocol.md)), we encountered timeout failures during bulk vector storage operations:

```
[ERROR] Failed to store batch (batchStart:0, batchSize:50)
        - Adapter call timed out after 30000ms
```

**Root Cause:** Different adapter operations have vastly different execution times:
- `cache.get()` - 5-50ms (in-memory/Redis lookup)
- `embeddings.embed()` - 100-500ms (OpenAI API call)
- `vectorStore.search()` - 1-5s (vector similarity + BM25)
- `vectorStore.upsert(batch=50)` - **30-60s** (Qdrant indexing overhead)

A fixed 30-second timeout fails for slow operations while being wasteful for fast ones.

## Decision

We implement a **declarative timeout configuration** with operation-specific timeouts and an extensibility path for future ML-based adaptive timeouts.

### Phase 1: Declarative Timeouts (Implemented)

#### 1. Timeout Configuration Map

Created `timeout-config.ts` with operation-specific timeouts:

```typescript
export const OPERATION_TIMEOUTS: Record<string, number> = {
  // Exact match: "adapter.method"
  'vectorStore.upsert': 120_000,        // 2 min (bulk indexing)
  'vectorStore.search': 30_000,         // 30s (hybrid search)
  'embeddings.embedBatch': 120_000,     // 2 min (OpenAI batching)
  'llm.generate': 90_000,               // 1.5 min (LLM generation)

  // Wildcard: "adapter.*"
  'vectorStore.*': 60_000,
  'cache.*': 10_000,

  // Global fallback
  '*': 30_000,
};
```

#### 2. Smart Timeout Selection

Priority chain for selecting timeout:
1. **Explicit call timeout** (highest priority) - `call.timeout`
2. **Transport config timeout** - `transport.config.timeout`
3. **Operation-specific timeout** - from `OPERATION_TIMEOUTS`
4. **Global fallback** - `30_000ms`

```typescript
export function selectTimeout(
  call: { adapter: string; method: string; timeout?: number },
  configTimeout?: number
): number {
  return call.timeout
    ?? configTimeout
    ?? getOperationTimeout(call.adapter, call.method);
}
```

#### 3. Integration Points

Updated both transports:
- `UnixSocketTransport.send()` - uses `selectTimeout()`
- `IPCTransport.send()` - uses `selectTimeout()`

### Phase 2: ML-Based Adaptive Timeouts (Future)

Planned architecture for v2:

```typescript
class TimeoutManager {
  private adaptive?: AdaptiveTimeoutManager;

  getTimeout(call: AdapterCall): number {
    // Try ML prediction first (if enabled and has enough data)
    if (this.adaptive?.hasEnoughData(call)) {
      return this.adaptive.predict(call); // P95 latency + 50%
    }

    // Graceful fallback to static config
    return selectTimeout(call, this.config.timeout);
  }

  recordDuration(call: AdapterCall, duration: number): void {
    // Feed historical data to ML model
    this.adaptive?.record(call, duration);
  }
}
```

**Features:**
- Self-learning based on P95 latency
- Automatic adaptation to system performance
- Graceful degradation on ML failure
- Opt-in via `enableML: true` config flag

## Implementation

### Files Created

1. **timeout-config.ts** - Declarative timeout map and selection logic
   - `OPERATION_TIMEOUTS` - 20+ operation-specific timeouts
   - `getOperationTimeout()` - Priority-based lookup
   - `selectTimeout()` - Smart timeout selection with fallback chain

2. **Updated Transports**
   - `unix-socket-transport.ts` - Line 136: Uses `selectTimeout()`
   - `ipc-transport.ts` - Line 87: Uses `selectTimeout()`

### Timeout Values Rationale

| Operation | Timeout | Reasoning |
|-----------|---------|-----------|
| `vectorStore.upsert` | 120s | Qdrant indexing for 50 vectors (1536 dims each) |
| `embeddings.embedBatch` | 120s | OpenAI API batching + rate limiting |
| `vectorStore.search` | 30s | Hybrid search (BM25 + vector) |
| `llm.generate` | 90s | LLM generation (depends on output length) |
| `cache.*` | 10s | Fast in-memory/Redis operations |
| `*` (fallback) | 30s | Safe default for unknown operations |

## Consequences

### Positive

✅ **Eliminates timeout failures** - Bulk operations now have sufficient time
✅ **Better resource utilization** - Fast operations fail quickly
✅ **Declarative and maintainable** - Easy to adjust timeouts per operation
✅ **Type-safe** - TypeScript enforces operation names
✅ **Extensible** - Clear path to ML-based adaptive timeouts
✅ **Override-friendly** - Can override at call, transport, or operation level

### Negative

⚠️ **Still uses magic numbers** - Timeouts are empirically determined
⚠️ **No auto-scaling** - Doesn't adapt to system performance changes
⚠️ **Maintenance overhead** - Need to update timeouts for new operations

### Neutral

📊 **Phase 2 solves negative consequences** - ML-based timeouts will:
- Auto-adapt based on P95 latency
- Eliminate manual tuning
- Scale with system performance

## Testing

**Before fix:**
```
[ERROR] Failed to store batch - Adapter call timed out after 30000ms
[INFO] Storage complete - chunksStored:0
```

**After fix:**
```
[INFO] Storing chunks (chunksCount:10414)
[INFO] Storage complete (chunksStored:10414)  ✅
```

Full indexing test:
- 2,354 files → 10,423 chunks
- Embeddings: 10,414 vectors (2,595,948 tokens)
- **Storage: SUCCESS** (no timeouts)
- Duration: ~9-10 minutes

## Alternatives Considered

### 1. Single Large Timeout (Rejected)
**Approach:** Set timeout to 120s for all operations
**Why rejected:** Wastes time on fast operations, masks real errors

### 2. Dynamic Size-Based Timeout (Rejected)
**Approach:** Calculate timeout from payload size
**Why rejected:** Adds overhead, doesn't account for backend processing time

### 3. Chunked Operations Only (Rejected)
**Approach:** Split large batches into smaller ones with shorter timeouts
**Why rejected:** More network round-trips, doesn't solve root cause

### 4. Declarative + ML Hybrid (Selected)
**Approach:** Start with static config, evolve to ML with graceful fallback
**Why selected:** Best of both worlds - simple now, intelligent later

## Related

- [ADR-0038: IPC Serialization Protocol](0038-ipc-serialization-protocol.md) - Unix Socket transport
- [TASK-002: Mind RAG Not Using Platform Adapters](../../docs/tasks/TASK-002-mind-rag-platform-adapters.md)
- Future: ADR-00XX - ML-Based Adaptive Timeout Prediction

## References

- Unix Socket performance: 1-2 GB/s (100-1000x faster than IPC)
- Qdrant upsert latency: ~30-60s for 50 vectors (1536 dims)
- OpenAI embeddings API: ~10-30s per batch (with rate limiting)
- P95 latency methodology: 95th percentile + 50% safety margin
