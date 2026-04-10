# @kb-labs/adapters-log-sqlite

> Part of [KB Labs](https://github.com/KirillBaranov/kb-labs) ecosystem. Works exclusively within KB Labs platform.

SQLite persistence adapter for KB Labs logs. Provides long-term storage, cross-process log aggregation, and full-text search.

## Features

- ✅ **Persistent storage** - Logs survive restarts
- ✅ **Cross-process aggregation** - All processes write to shared database
- ✅ **Full-text search** - SQLite FTS5 for fast message search
- ✅ **Batch writes** - High performance with configurable batching
- ✅ **Advanced queries** - Filter by level, source, timestamp, pagination
- ✅ **Retention policies** - Delete old logs automatically
- ✅ **Transaction support** - ACID guarantees for data integrity

## Installation

```bash
pnpm add @kb-labs/adapters-log-sqlite
```

## Usage

### Basic Usage

```typescript
import { createAdapter as createPersistence } from '@kb-labs/adapters-log-sqlite';
import { createAdapter as createDB } from '@kb-labs/adapters-sqlite';

// Create database
const db = createDB({ filename: '.kb/data/kb.db' });

// Create persistence adapter
const persistence = await createPersistence({
  database: db,
  batchSize: 100,
  flushInterval: 5000, // 5 seconds
});

// Write logs
await persistence.write({
  timestamp: Date.now(),
  level: 'info',
  message: 'Server started',
  fields: { port: 3000 },
  source: 'rest-api',
});

// Query logs
const result = await persistence.query(
  { level: 'error', from: Date.now() - 3600000 },
  { limit: 50, offset: 0 }
);

console.log(result.logs);
console.log(result.total);
console.log(result.hasMore);

// Search logs
const searchResults = await persistence.search('authentication failed');

// Get single log
const log = await persistence.getById('log-id-123');

// Clean up
await persistence.close();
```

### With Platform Initialization

```typescript
// .kb/kb.config.json
{
  "adapters": {
    "database": {
      "sql": {
        "module": "@kb-labs/adapters-sqlite",
        "config": {
          "filename": ".kb/data/kb.db"
        }
      }
    },
    "logPersistence": {
      "module": "@kb-labs/adapters-log-sqlite",
      "config": {
        "database": "${platform.db}",
        "tableName": "logs",
        "batchSize": 100,
        "flushInterval": 5000
      }
    }
  }
}
```

```typescript
// In your application
const platform = await initPlatform(config);

// Persistence is available
await platform.logPersistence?.write(logRecord);

// Query logs
const logs = await platform.logPersistence?.query({ level: 'error' });
```

### REST API Integration

```typescript
// Historical log queries
app.get('/logs', async (request, reply) => {
  const { from, to, level, source, limit = 100, offset = 0 } = request.query;

  const result = await platform.logPersistence!.query(
    { from, to, level, source },
    { limit, offset }
  );

  return result;
});

// Get single log
app.get('/logs/:id', async (request, reply) => {
  const { id } = request.params;
  const log = await platform.logPersistence!.getById(id);

  if (!log) {
    return reply.code(404).send({ error: 'Log not found' });
  }

  return log;
});

// Search logs
app.get('/logs/search', async (request, reply) => {
  const { q, limit = 100, offset = 0 } = request.query;

  const result = await platform.logPersistence!.search(q, { limit, offset });
  return result;
});
```

## API Reference

### `createAdapter(config)`

Factory function to create persistence adapter.

**Parameters:**
- `config.database` (ISQLDatabase, required) - Database adapter instance
- `config.tableName` (string, optional) - Table name (default: 'logs')
- `config.batchSize` (number, optional) - Batch size (default: 100)
- `config.flushInterval` (number, optional) - Flush interval in ms (default: 5000)

**Returns:** `Promise<ILogPersistence>`

### `persistence.write(record)`

Write single log record.

**Parameters:**
- `record` (LogRecord) - Log record to persist

**Returns:** `Promise<void>`

### `persistence.writeBatch(records)`

Write multiple log records in batch.

**Parameters:**
- `records` (LogRecord[]) - Array of log records

**Returns:** `Promise<void>`

### `persistence.query(query, options)`

Query logs with filters and pagination.

**Parameters:**
- `query.level` (LogLevel, optional) - Filter by log level
- `query.source` (string, optional) - Filter by source
- `query.from` (number, optional) - Start timestamp (inclusive)
- `query.to` (number, optional) - End timestamp (inclusive)
- `options.limit` (number, optional) - Max results (default: 100)
- `options.offset` (number, optional) - Skip results (default: 0)
- `options.sortBy` ('timestamp' | 'level', optional) - Sort field (default: 'timestamp')
- `options.sortOrder` ('asc' | 'desc', optional) - Sort order (default: 'desc')

**Returns:** `Promise<{ logs, total, hasMore }>`

### `persistence.getById(id)`

Get single log record by ID.

**Parameters:**
- `id` (string) - Log record ID

**Returns:** `Promise<LogRecord | null>`

### `persistence.search(searchText, options)`

Full-text search on log messages.

**Parameters:**
- `searchText` (string) - Search query (FTS5 syntax)
- `options.limit` (number, optional) - Max results (default: 100)
- `options.offset` (number, optional) - Skip results (default: 0)

**Returns:** `Promise<{ logs, total, hasMore }>`

### `persistence.deleteOlderThan(beforeTimestamp)`

Delete logs older than timestamp.

**Parameters:**
- `beforeTimestamp` (number) - Delete logs before this timestamp

**Returns:** `Promise<number>` - Number of deleted logs

### `persistence.getStats()`

Get storage statistics.

**Returns:** `Promise<{ totalLogs, oldestTimestamp, newestTimestamp, sizeBytes }>`

### `persistence.close()`

Close adapter and flush pending writes.

**Returns:** `Promise<void>`

## Database Schema

```sql
-- Logs table
CREATE TABLE logs (
  id TEXT PRIMARY KEY,
  timestamp INTEGER NOT NULL,
  level TEXT NOT NULL,
  message TEXT NOT NULL,
  source TEXT NOT NULL,
  fields TEXT, -- JSON
  created_at INTEGER NOT NULL
);

-- Indexes
CREATE INDEX idx_logs_timestamp ON logs(timestamp DESC);
CREATE INDEX idx_logs_level ON logs(level);
CREATE INDEX idx_logs_source ON logs(source);
CREATE INDEX idx_logs_level_timestamp ON logs(level, timestamp DESC);
CREATE INDEX idx_logs_source_timestamp ON logs(source, timestamp DESC);

-- Full-text search
CREATE VIRTUAL TABLE logs_fts USING fts5(message, content=logs);
```

## Performance Characteristics

| Operation | Time Complexity | Notes |
|-----------|-----------------|-------|
| `write()` | O(1) amortized | Batched writes |
| `writeBatch()` | O(n) | Transaction-based |
| `query()` | O(log n + k) | Index scan + k results |
| `getById()` | O(log n) | Primary key lookup |
| `search()` | O(m) | FTS5 search, m = matches |
| `deleteOlderThan()` | O(d) | d = deleted rows |

**Batch write performance:**
- 100 logs/batch: ~10-20ms per batch
- 1000 logs/batch: ~50-100ms per batch
- Auto-flush: Every 5 seconds (configurable)

**Query performance:**
- Simple query: ~1-5ms (indexed)
- Full-text search: ~10-50ms (depends on corpus size)
- Pagination: O(1) with LIMIT/OFFSET

## Configuration Examples

### High-Traffic Server

```typescript
const persistence = await createAdapter({
  database: db,
  batchSize: 500,    // Larger batches
  flushInterval: 10000, // 10 seconds
});
```

### Low-Traffic CLI

```typescript
const persistence = await createAdapter({
  database: db,
  batchSize: 50,     // Smaller batches
  flushInterval: 2000, // 2 seconds
});
```

### Real-time Requirements

```typescript
const persistence = await createAdapter({
  database: db,
  batchSize: 10,     // Tiny batches
  flushInterval: 100, // 100ms (fast flush)
});
```

## Retention Policy Example

```typescript
// Delete logs older than 30 days
const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
const deleted = await persistence.deleteOlderThan(thirtyDaysAgo);
console.log(`Deleted ${deleted} old logs`);

// Run as cron job (e.g., daily at 3am)
import { CronJob } from 'cron';

new CronJob('0 3 * * *', async () => {
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const deleted = await persistence.deleteOlderThan(thirtyDaysAgo);
  console.log(`Retention policy: deleted ${deleted} old logs`);
}).start();
```

## Cross-Process Log Aggregation

All processes write to the same SQLite database, enabling unified log queries:

```typescript
// Process 1: REST API
await platform.logPersistence!.write({
  timestamp: Date.now(),
  level: 'info',
  message: 'API request received',
  source: 'rest-api',
  fields: { endpoint: '/users' },
});

// Process 2: CLI
await platform.logPersistence!.write({
  timestamp: Date.now(),
  level: 'info',
  message: 'Workflow started',
  source: 'cli',
  fields: { workflowId: 'wf-123' },
});

// Query from any process - sees logs from both
const allLogs = await platform.logPersistence!.query({});
// Returns logs from rest-api AND cli
```

## When to Use

✅ **Use persistence when:**
- You need historical log queries (beyond 1 hour)
- You need cross-process log aggregation
- You need full-text search on log messages
- You need to implement retention policies
- You want logs to survive restarts

❌ **Don't use persistence when:**
- You only need real-time streaming (use ring buffer)
- You need sub-millisecond latency (use ring buffer)
- Disk space is extremely constrained

## Combining with Ring Buffer

For best results, use both adapters together:

```typescript
// REST API config
{
  "adapters": {
    "logRingBuffer": {
      "module": "@kb-labs/adapters-log-ringbuffer",
      "config": { "maxSize": 1000, "ttl": 3600000 }
    },
    "logPersistence": {
      "module": "@kb-labs/adapters-log-sqlite",
      "config": { "database": "${platform.db}" }
    }
  }
}
```

- **Ring buffer** → Real-time streaming (`/logs/stream`)
- **Persistence** → Historical queries (`/logs?from=...&to=...`)

## License

[KB Public License v1.1](../../LICENSE) - KB Labs Team
