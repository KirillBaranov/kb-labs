# ADR-0028: Memory-Aware Parallel Processing

**Date:** 2025-11-26
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-11-26
**Tags:** [architecture, performance, memory, chunking]

## Context

When processing large codebases (2000+ files), the chunking stage can consume significant memory, leading to:

1. **Out-of-memory crashes** - Node.js heap exhaustion with default 4GB limit
2. **GC pressure** - Frequent garbage collection pauses slowing down processing
3. **Unpredictable performance** - Memory usage varies based on file sizes and AST complexity

**Previous approach:**
- Fixed concurrency (`Promise.all` with all files)
- No memory monitoring
- Batch processing without backpressure

**Alternatives considered:**
1. **Stream processing** - Complex to implement with AST parsing
2. **Worker threads** - Additional complexity, IPC overhead
3. **External queue (Redis/RabbitMQ)** - Overkill for local processing

## Decision

Implemented **memory-aware parallel processing** in the chunking stage with dynamic concurrency adjustment:

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   ChunkingStage                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │            MemoryAwareScheduler                      │    │
│  │  ┌─────────────┐ ┌─────────────┐ ┌───────────────┐  │    │
│  │  │ Heap Monitor│ │ Concurrency │ │ Backpressure  │  │    │
│  │  │ (polling)   │ │ Controller  │ │ Queue         │  │    │
│  │  └─────────────┘ └─────────────┘ └───────────────┘  │    │
│  └─────────────────────────────────────────────────────┘    │
│                           │                                  │
│                    process(file)                             │
│                           ▼                                  │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              Worker Pool (dynamic size)              │    │
│  │         [Worker1] [Worker2] ... [WorkerN]           │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### Key Parameters

```typescript
interface MemoryAwareOptions {
  safeThreshold: number;    // 0.75 = 75% heap usage threshold
  minConcurrency: number;   // 2 = minimum parallel tasks
  maxConcurrency: number;   // CPU cores or configured limit
  memoryReserve: number;    // 256MB reserved for system
  checkIntervalMs: number;  // 1000ms polling interval
}
```

### Algorithm

1. **Initial phase**: Start with `maxConcurrency` workers
2. **Monitor phase**: Poll `process.memoryUsage().heapUsed` every second
3. **Throttle phase**: If heap > `safeThreshold`:
   - Reduce active concurrency
   - Trigger `global.gc()` if exposed
   - Wait for memory to stabilize
4. **Resume phase**: Gradually increase concurrency when memory drops

### Integration with Rate Limiting

Memory-aware processing works independently from rate limiting:
- **Chunking stage**: Memory-aware scheduler controls file processing
- **Embedding stage**: Rate limiter controls API requests

Both systems coordinate through the pipeline:
```
Files → [Memory-aware Chunking] → Chunks → [Rate-limited Embedding] → Vectors
```

## Consequences

### Positive

- **No OOM crashes** - Dynamic throttling prevents heap exhaustion
- **Predictable memory usage** - Stays within configured threshold
- **Automatic adaptation** - Adjusts to available system resources
- **Graceful degradation** - Slower but stable under memory pressure
- **Observable** - Metrics `peakActiveTasks`, `heapUsagePercent` in logs

### Negative

- **Reduced throughput** - Throttling slows down processing when memory is tight
- **Polling overhead** - 1ms/second for memory checks (negligible)
- **Non-deterministic timing** - Processing time depends on system state

### Alternatives Considered

1. **Pre-calculate memory requirements**
   - Rejected: Impossible to predict AST memory usage accurately

2. **Use streams with highWaterMark**
   - Rejected: AST parsing requires full file in memory

3. **Process files sequentially**
   - Rejected: Too slow for large codebases (10x slower)

## Implementation

### Memory Monitoring

```typescript
function getHeapUsagePercent(): number {
  const { heapUsed, heapTotal } = process.memoryUsage();
  return heapUsed / heapTotal;
}

async function processWithMemoryAwareness<T>(
  items: T[],
  processor: (item: T) => Promise<void>,
  options: MemoryAwareOptions
): Promise<void> {
  const active = new Set<Promise<void>>();
  let currentConcurrency = options.maxConcurrency;

  for (const item of items) {
    // Check memory pressure
    if (getHeapUsagePercent() > options.safeThreshold) {
      currentConcurrency = Math.max(options.minConcurrency, currentConcurrency - 1);
      if (global.gc) global.gc();
      await Promise.race(active); // Wait for slot
    }

    // Process item
    const promise = processor(item).finally(() => active.delete(promise));
    active.add(promise);

    // Maintain concurrency limit
    if (active.size >= currentConcurrency) {
      await Promise.race(active);
    }
  }

  await Promise.all(active);
}
```

### CLI Flag for GC Access

```bash
# Enable manual GC for better memory management
NODE_OPTIONS="--expose-gc --max-old-space-size=4096" pnpm kb mind rag-index
```

### Logging

```json
{
  "level": "info",
  "msg": "Memory-aware parallel chunking complete",
  "filesProcessed": 2173,
  "totalChunks": 5342,
  "peakActiveTasks": 8,
  "failedTasks": 0,
  "heapUsagePercent": "72.3%"
}
```

## References

- [Node.js Memory Management](https://nodejs.org/en/docs/guides/diagnostics/memory/using-gc-traces)
- [ADR-0021: Incremental Indexing](./0021-incremental-indexing.md)
- [ADR-0027: Provider-Agnostic Rate Limiting](./0027-provider-agnostic-rate-limiting.md)

---

**Last Updated:** 2025-11-26
**Next Review:** 2026-02-26
