# ADR-0044: Unified Log Query Service

**Date:** 2026-01-10
**Status:** Accepted
**Tags:** [logging, observability, services, architecture]

## Context

### Problem Statement

The current logging system has **two separate storage backends** with no unified access layer:

1. **Ring Buffer** (`ILogBuffer`) - In-memory circular buffer for recent logs (last 1000)
   - Fast, real-time streaming via SSE
   - Limited capacity, no persistence
   - Accessed via `platform.logger.getLogBuffer?.()`

2. **SQLite Persistence** (`ILogPersistence`) - Database for historical logs
   - Full-text search (FTS5)
   - Unlimited capacity with retention policies
   - **No unified access** - REST API doesn't use it!

**Current Problems:**

1. **REST API has storage logic embedded in routes**
   ```typescript
   // ❌ REST API knows about ring buffer implementation
   const buffer = platform.logger.getLogBuffer?.();
   const logs = buffer.query(query);
   ```

2. **SQLite persistence exists but is unused**
   - Logs are written to `.kb/database/kb.sqlite` automatically
   - REST API only reads from ring buffer (last 1000 logs)
   - Frontend cannot access historical logs beyond buffer capacity

3. **No abstraction for log querying**
   - Can't switch storage backends via config
   - Can't add new backends (PostgreSQL, ClickHouse) without changing REST API
   - Hard to test (mocking `ILogBuffer` is awkward)

4. **Inconsistent capabilities**
   - Ring buffer: streaming ✅, persistence ❌, search ❌
   - SQLite: streaming ❌, persistence ✅, search ✅
   - No way to combine strengths of both

### Current Architecture

```
┌──────────────────────────────────────────────────────┐
│ REST API (GET /api/v1/logs)                          │
│ ❌ Knows about ILogBuffer                            │
│ ❌ Has storage selection logic                       │
│ ❌ Doesn't use ILogPersistence                       │
└──────────────────────────────────────────────────────┘
                    ↓
┌──────────────────────────────────────────────────────┐
│ platform.logger.getLogBuffer?()                      │
│ Returns: ILogBuffer (ring buffer only)               │
└──────────────────────────────────────────────────────┘
                    ↓
┌──────────────────────────────────────────────────────┐
│ Ring Buffer (last 1000 logs)                         │
│ ✅ Fast, real-time streaming                         │
│ ❌ Limited capacity, no history                      │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│ SQLite Persistence (ALL logs)                        │
│ ✅ Full-text search, unlimited history               │
│ ❌ NOT ACCESSIBLE via REST API                       │
└──────────────────────────────────────────────────────┘
```

### Key Design Principles

1. **Separation of Concerns** - REST API should not know about storage backends
2. **Configuration-Driven** - Backend selection via `kb.config.json`, not code
3. **Graceful Degradation** - Work with any combination of backends (persistence only, buffer only, both, neither)
4. **Single Responsibility** - One service handles all log queries

### Constraints

- **Backward compatibility** - Existing REST API must continue working
- **Performance** - Recent logs (<1 hour) should be fast (use buffer if available)
- **No breaking changes** - `ILogBuffer` and `ILogPersistence` interfaces unchanged
- **Type safety** - Full TypeScript support with proper inference

## Decision

We will implement a **Unified Log Query Service** (`ILogReader`) that abstracts storage backends and provides a single API for all log queries.

### Architecture

```
┌──────────────────────────────────────────────────────────┐
│ REST API (GET /api/v1/logs)                              │
│ ✅ platform.logs.query(filters, options)                 │
│ ✅ No knowledge of storage backends                      │
└──────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────┐
│ ILogReader (platform contract)                     │
│ - query(filters, options) → unified API                  │
│ - getById(id) → single log                               │
│ - search(text) → full-text search                        │
│ - subscribe(callback) → real-time stream                 │
│ - getStats() → combined statistics                       │
│ - getCapabilities() → what backends are available        │
└──────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────┐
│ HybridLogReader (implementation)                   │
│ ✅ Auto-selects: SQLite OR ring buffer OR both           │
│ ✅ Configured via kb.config.json                         │
│ ✅ Graceful fallback if backend unavailable              │
│ ✅ Transparent to REST API                               │
└──────────────────────────────────────────────────────────┘
           ↓                              ↓
┌────────────────────────┐   ┌───────────────────────────┐
│ ILogPersistence        │   │ ILogBuffer                │
│ (SQLite adapter)       │   │ (ring buffer adapter)     │
└────────────────────────┘   └───────────────────────────┘
```

### Service Contract

```typescript
/**
 * Unified log reader adapter interface.
 * Abstracts storage backend (SQLite, ring buffer, remote API, etc.).
 */
export interface ILogReader {
  /**
   * Query logs with filters and pagination.
   * Automatically selects best backend.
   */
  query(
    filters: LogQuery,
    options?: QueryOptions
  ): Promise<LogQueryResult>;

  /**
   * Get single log by ID.
   * Searches both ring buffer and persistence.
   */
  getById(id: string): Promise<LogRecord | null>;

  /**
   * Full-text search (uses FTS if available).
   */
  search(
    searchText: string,
    options?: SearchOptions
  ): Promise<LogSearchResult>;

  /**
   * Subscribe to real-time log stream.
   */
  subscribe(
    callback: (log: LogRecord) => void,
    filters?: LogQuery
  ): () => void;

  /**
   * Get statistics (buffer + persistence).
   */
  getStats(): Promise<LogStats>;

  /**
   * Check available backends.
   */
  getCapabilities(): LogCapabilities;
}
```

### Backend Selection Strategy

```typescript
class HybridLogReader implements ILogReader {
  constructor(
    private persistence?: ILogPersistence,  // SQLite (if configured)
    private buffer?: ILogBuffer             // Ring buffer (if configured)
  ) {}

  async query(filters: LogQuery, options: QueryOptions) {
    // Strategy 1: Use persistence if available (preferred)
    if (this.persistence) {
      return await this.persistence.query(filters, options);
    }

    // Strategy 2: Fallback to buffer (limited data)
    if (this.buffer) {
      return this.queryFromBuffer(filters, options);
    }

    // Strategy 3: No storage available
    throw new Error('No log storage backend available');
  }
}
```

### Platform Integration

```typescript
// kb-labs-core/packages/core-runtime/src/container.ts

export class PlatformContainer {
  private _logQueryService?: ILogReader;

  /**
   * Unified log reader adapter.
   * Automatically uses configured backends.
   */
  get logs(): ILogReader {
    if (!this._logQueryService) {
      const persistence = this.getAdapter<ILogPersistence>('logPersistence');
      const buffer = this.logger.getLogBuffer?.();

      this._logQueryService = new HybridLogReader(persistence, buffer);
    }
    return this._logQueryService;
  }
}
```

### REST API Usage (Clean)

```typescript
// kb-labs-rest-api/apps/rest-api/src/routes/logs.ts

server.get('/api/v1/logs', async (request, reply) => {
  // ✅ Clean: no storage logic, just call platform.logs
  const result = await platform.logs.query(filters, options);

  return {
    ok: true,
    data: {
      logs: result.logs.map(toFrontendLogRecord),
      total: result.total,
      hasMore: result.hasMore,
      source: result.source,  // 'buffer' | 'persistence' (debug info)
    },
  };
});

server.get('/api/v1/logs/:id', async (request, reply) => {
  const log = await platform.logs.getById(request.params.id);
  if (!log) {
    return reply.code(404).send({ error: 'Log not found' });
  }
  return { ok: true, data: toFrontendLogRecord(log) };
});

server.get('/api/v1/logs/search', async (request, reply) => {
  const result = await platform.logs.search(request.query.q, options);
  return { ok: true, data: result };
});
```

## Consequences

### Positive

1. **Separation of Concerns**
   - REST API has zero storage logic
   - Easy to test with mocks
   - Backend changes don't affect REST API

2. **Configuration-Driven**
   ```json
   {
     "platform": {
       "adapters": {
         "logPersistence": "@kb-labs/adapters-log-sqlite",  // ← enables SQLite
         "logRingBuffer": "@kb-labs/adapters-log-ringbuffer"
       }
     }
   }
   ```
   - Remove adapter → automatic fallback
   - Add adapter → automatically used
   - No code changes required

3. **Easy to Extend**
   - Add PostgreSQL backend: implement `ILogPersistence`, update config
   - Add remote backend: implement `ILogReader`, update config
   - REST API unchanged

4. **Graceful Degradation**
   - Both backends: prefer persistence (complete data)
   - Persistence only: use it (historical + recent)
   - Buffer only: use it (recent logs only)
   - Neither: error 503 with helpful message

5. **Better UX**
   - Frontend can now access **all logs** (not just last 1000)
   - Full-text search works (FTS5)
   - Log details by ID work

6. **Type Safety**
   ```typescript
   const logs = await platform.logs.query({ level: 'error' });
   //    ^? ILogReader - fully typed
   ```

### Negative

1. **Additional Abstraction Layer**
   - One more interface to maintain
   - Slightly more complex than direct adapter access
   - **Mitigation:** Well-documented, simple interface

2. **Potential Performance Overhead**
   - Extra function call for every query
   - **Mitigation:** Negligible (< 1ms), backend I/O dominates

3. **Migration Required**
   - REST API routes must change to use `platform.logs`
   - **Mitigation:** Straightforward refactor, backward compatible

4. **No Direct Buffer Access**
   - Can't call `buffer.subscribe()` directly
   - **Mitigation:** Use `platform.logs.subscribe()` instead (same API)

### Alternatives Considered

#### Alternative 1: Keep Current Approach (Do Nothing)
**Pros:**
- No changes required
- Simple

**Cons:**
- SQLite persistence never used
- REST API has storage logic
- Cannot access historical logs
- Hard to extend

**Rejected because:** Critical gap - historical logs inaccessible.

#### Alternative 2: Make REST API Smart (Query Both Backends)
```typescript
server.get('/api/v1/logs', async () => {
  const persistence = platform.getAdapter('logPersistence');
  const buffer = platform.logger.getLogBuffer();

  if (persistence) {
    return await persistence.query(filters);
  } else if (buffer) {
    return buffer.query(filters);
  } else {
    throw new Error('No storage');
  }
});
```

**Pros:**
- No new abstraction

**Cons:**
- REST API still has storage logic (violates SoC)
- Duplicated logic across endpoints
- Hard to test

**Rejected because:** Doesn't solve architectural problem.

#### Alternative 3: Extend ILogger Interface
```typescript
interface ILogger {
  queryLogs(filters: LogQuery): Promise<LogRecord[]>;
}
```

**Pros:**
- Single interface

**Cons:**
- Conflates logging (write) with querying (read)
- Not all loggers support querying
- Breaks Single Responsibility Principle

**Rejected because:** Wrong abstraction level.

#### Alternative 4: Service Locator Pattern
```typescript
const logService = platform.getService<ILogReader>('logs');
```

**Pros:**
- Generic service access pattern

**Cons:**
- String-based lookup (type-unsafe)
- More boilerplate
- Less discoverable than `platform.logs`

**Rejected because:** Worse DX than property getter.

## Implementation

### Files to Create

1. **Interface**
   - `kb-labs-core/packages/core-platform/src/services/log-query-service.ts`
   - Export `ILogReader`, `LogQueryResult`, etc.

2. **Implementation**
   - `kb-labs-core/packages/core-services/src/log-query/hybrid-log-query-service.ts`
   - `HybridLogReader` class

3. **Tests**
   - `kb-labs-core/packages/core-services/src/log-query/__tests__/hybrid-log-query-service.test.ts`
   - Unit tests with mocked backends

4. **Integration**
   - Update `kb-labs-core/packages/core-runtime/src/container.ts`
   - Add `get logs(): ILogReader` getter

5. **REST API**
   - Update `kb-labs-rest-api/apps/rest-api/src/routes/logs.ts`
   - Replace `platform.logger.getLogBuffer()` with `platform.logs.*`

### Migration Steps

1. ✅ Write ADR (this document)
2. ✅ Create `ILogReader` interface
3. ✅ Implement `HybridLogReader`
4. ✅ Add `platform.logs` getter
5. ✅ Write unit tests
6. ✅ Update REST API routes
7. ✅ Write integration tests
8. ✅ Update frontend data client (optional)

### Testing Strategy

**Unit Tests:**
- Mock both `ILogPersistence` and `ILogBuffer`
- Test all backend combinations:
  - Both available (prefer persistence)
  - Persistence only
  - Buffer only
  - Neither (error)
- Test graceful degradation

**Integration Tests:**
- Real SQLite + ring buffer
- Verify REST API endpoints return correct data
- Verify SSE streaming works
- Verify search with FTS5

### Rollback Plan

If issues arise:
1. Revert REST API changes
2. Keep `ILogReader` (doesn't break anything)
3. Use old `platform.logger.getLogBuffer()` pattern temporarily

### Future Enhancements

This design enables future improvements:
1. **Federated logs** - Query logs from multiple services
2. **Remote backends** - ClickHouse, PostgreSQL, Elasticsearch
3. **Caching layer** - Redis cache for hot queries
4. **Query optimization** - Smart routing based on query patterns
5. **Log aggregation** - Merge logs from multiple sources

## References

- [ADR-0037: State Broker for Persistent Cache](./0037-state-broker-persistent-cache.md)
- [ADR-0043: Adapter Manifest System](./0043-adapter-manifest-system.md)
- [ILogPersistence Interface](../../packages/core-platform/src/adapters/log-persistence.ts)
- [ILogBuffer Interface](../../packages/core-platform/src/adapters/logger.ts)
- [LogRingBuffer Implementation](../../../kb-labs-adapters/packages/adapters-pino/src/log-ring-buffer.ts)
- [SQLite Log Persistence](../../../kb-labs-adapters/packages/adapters-log-sqlite/src/index.ts)

---

**Last Updated:** 2026-01-10
**Next Review:** 2026-04-10 (3 months)
