# @kb-labs/adapters-log-ringbuffer

> Part of [KB Labs](https://github.com/KirillBaranov/kb-labs) ecosystem. Works exclusively within KB Labs platform.

In-memory ring buffer adapter for real-time log streaming in KB Labs.

## Features

- ✅ **Fixed-size circular buffer** - Default 1000 logs, configurable
- ✅ **Time-to-live expiration** - Automatic cleanup of old logs (default 1 hour)
- ✅ **Real-time subscriptions** - SSE streaming support
- ✅ **Memory-bounded** - Automatic eviction of oldest logs when full
- ✅ **Query support** - Filter by level, source, timestamp
- ✅ **Zero dependencies** - Pure TypeScript implementation

## Installation

```bash
pnpm add @kb-labs/adapters-log-ringbuffer
```

## Usage

### Basic Usage

```typescript
import { createAdapter } from '@kb-labs/adapters-log-ringbuffer';

// Create buffer
const buffer = createAdapter({
  maxSize: 1000, // Keep last 1000 logs
  ttl: 3600000,  // 1 hour TTL
});

// Append logs
buffer.append({
  timestamp: Date.now(),
  level: 'info',
  message: 'Server started',
  fields: { port: 3000 },
  source: 'rest-api',
});

// Query logs
const recentErrors = buffer.query({ level: 'error' });
console.log(recentErrors);

// Subscribe to real-time stream
const unsubscribe = buffer.subscribe((log) => {
  console.log('New log:', log);
});

// Clean up
unsubscribe();
```

### With Platform Initialization

```typescript
// .kb/kb.config.json
{
  "adapters": {
    "logRingBuffer": {
      "module": "@kb-labs/adapters-log-ringbuffer",
      "config": {
        "maxSize": 1000,
        "ttl": 3600000
      }
    }
  }
}
```

```typescript
// In your application
const platform = await initPlatform(config);

// Buffer is available
platform.logRingBuffer?.append(logRecord);

// Query logs
const logs = platform.logRingBuffer?.query({ level: 'error' });
```

### Real-time Streaming (SSE)

```typescript
// REST API endpoint
app.get('/logs/stream', (request, reply) => {
  if (!platform.logRingBuffer) {
    return reply.code(501).send({ error: 'Log streaming not available' });
  }

  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  const unsubscribe = platform.logRingBuffer.subscribe((log) => {
    reply.raw.write(`data: ${JSON.stringify(log)}\n\n`);
  });

  request.raw.on('close', () => {
    unsubscribe();
  });
});
```

## API Reference

### `createAdapter(config?)`

Factory function to create ring buffer adapter.

**Parameters:**
- `config.maxSize` (number, optional) - Maximum buffer size (default: 1000)
- `config.ttl` (number, optional) - Time-to-live in milliseconds (default: 3600000 = 1 hour)

**Returns:** `ILogRingBuffer`

### `buffer.append(record)`

Append log record to buffer. Evicts oldest log if buffer is full.

**Parameters:**
- `record` (LogRecord) - Log record to append

### `buffer.query(query?)`

Query logs from buffer with optional filters.

**Parameters:**
- `query.level` (LogLevel, optional) - Filter by log level
- `query.source` (string, optional) - Filter by source
- `query.from` (number, optional) - Start timestamp (inclusive)
- `query.to` (number, optional) - End timestamp (inclusive)
- `query.limit` (number, optional) - Maximum number of logs to return

**Returns:** `LogRecord[]` - Logs in reverse chronological order (newest first)

### `buffer.subscribe(callback)`

Subscribe to real-time log events.

**Parameters:**
- `callback` (function) - Called for each new log record

**Returns:** `() => void` - Unsubscribe function

### `buffer.getStats()`

Get buffer statistics.

**Returns:**
```typescript
{
  size: number;         // Current number of logs
  maxSize: number;      // Maximum buffer size
  oldestTimestamp: number; // Timestamp of oldest log (0 if empty)
  newestTimestamp: number; // Timestamp of newest log (0 if empty)
  evictions: number;    // Total evictions (size + TTL)
}
```

### `buffer.clear()`

Clear all logs from buffer. Resets eviction counter.

## Configuration Examples

### High-Traffic Server

```typescript
const buffer = createAdapter({
  maxSize: 5000,    // Keep more logs
  ttl: 600000,      // 10 minutes TTL
});
```

### Low-Traffic CLI

```typescript
const buffer = createAdapter({
  maxSize: 100,     // Small buffer
  ttl: 300000,      // 5 minutes TTL
});
```

### Development/Testing

```typescript
const buffer = createAdapter({
  maxSize: 10,      // Tiny buffer
  ttl: 10000,       // 10 seconds TTL
});
```

## Performance Characteristics

| Operation | Time Complexity | Space Complexity |
|-----------|-----------------|------------------|
| `append()` | O(1) amortized | O(1) |
| `query()` | O(n) where n = buffer size | O(n) |
| `subscribe()` | O(1) | O(1) |
| `clear()` | O(1) | O(1) |

**Memory usage:** ~200 bytes per log record (depends on fields size)

**Example:** 1000 logs × 200 bytes = ~200 KB

## When to Use

✅ **Use ring buffer when:**
- You need real-time log streaming (SSE)
- You only need recent logs (last N logs or last X hours)
- You're running a single-process server (REST API)
- You want low-latency access to recent logs

❌ **Don't use ring buffer when:**
- You need historical log queries (use persistence adapter)
- You need cross-process log aggregation (use persistence adapter)
- You need long-term storage (use persistence adapter)
- Memory is constrained

## License

[KB Public License v1.1](../../LICENSE) - KB Labs Team
