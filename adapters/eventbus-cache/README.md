# @kb-labs/adapters-eventbus-cache

> Part of [KB Labs](https://github.com/KirillBaranov/kb-labs) ecosystem. Works exclusively within KB Labs platform.

EventBus adapter that uses platform cache (`ICache`) for persistent event storage with polling-based subscriptions.

## Overview

| Property | Value |
|----------|-------|
| **Implements** | `IEventBus` |
| **Type** | `core` |
| **Requires** | `cache` |
| **Category** | EventBus |

## Features

- **Persistent events** - Events survive process restarts (if cache backend is persistent)
- **Distributed** - Works across multiple processes (if cache is Redis)
- **Automatic cleanup** - Old events removed via configurable TTL
- **Polling-based** - Configurable polling interval for subscribers
- **Ordered delivery** - Events delivered in timestamp order

## Installation

```bash
pnpm add @kb-labs/adapters-eventbus-cache
```

## Configuration

Add to your `kb.config.json`:

```json
{
  "platform": {
    "adapters": {
      "cache": "@kb-labs/adapters-redis",
      "eventBus": "@kb-labs/adapters-eventbus-cache"
    },
    "adapterOptions": {
      "eventBus": {
        "pollIntervalMs": 1000,
        "eventTtlMs": 86400000,
        "keyPrefix": "kb:eventbus:"
      }
    }
  }
}
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `pollIntervalMs` | `number` | `1000` | Polling interval in milliseconds |
| `eventTtlMs` | `number` | `86400000` | Event TTL (24 hours by default) |
| `keyPrefix` | `string` | `"eventbus:"` | Prefix for cache keys |

## Usage

### Via Platform (Recommended)

```typescript
import { usePlatform } from '@kb-labs/sdk';

const platform = usePlatform();

// Subscribe to events
const unsubscribe = platform.eventBus.subscribe('user.created', async (event) => {
  console.log('User created:', event);
});

// Publish event
await platform.eventBus.publish('user.created', { id: '123', name: 'Alice' });

// Cleanup on shutdown
unsubscribe();
```

### Standalone (Testing/Development)

```typescript
import { createAdapter } from '@kb-labs/adapters-eventbus-cache';
import { MemoryCache } from '@kb-labs/core-platform/noop';

const cache = new MemoryCache();
const eventBus = createAdapter(
  { pollIntervalMs: 500, eventTtlMs: 3600000 },
  { cache },
);

// Don't forget to disconnect on shutdown
eventBus.disconnect();
```

## How It Works

Events are stored in sorted sets using cache's `zadd`/`zrangebyscore` with timestamp as score:

```
┌─────────────┐     ┌─────────────────────┐     ┌─────────────┐
│  Publisher  │────▶│  CacheEventBusAdapter│────▶│    Cache    │
└─────────────┘     └─────────────────────┘     └─────────────┘
                              │
                              │ poll (interval)
                              ▼
                    ┌─────────────────────┐
                    │    Subscribers      │
                    └─────────────────────┘
```

**Storage structure:**
```
eventbus:user.created -> [
  { score: 1706745600000, member: '{"id":"evt-1","topic":"user.created","data":{...},"timestamp":1706745600000}' },
  { score: 1706745601000, member: '{"id":"evt-2","topic":"user.created","data":{...},"timestamp":1706745601000}' },
]
```

**Subscription flow:**
1. Subscriber registers with `lastTimestamp = Date.now()`
2. Polling timer fires every `pollIntervalMs`
3. Adapter queries `zrangebyscore(key, lastTimestamp + 1, now)`
4. Events processed sequentially, `lastTimestamp` updated
5. Old events (> TTL) cleaned up automatically

## Dependencies

This adapter requires the following adapters to be configured:

| Dependency | Adapter Key | Description |
|------------|-------------|-------------|
| `cache` | `cache` | Cache backend for event storage (Redis, Memory, etc.) |

> Dependencies are automatically resolved by the platform's AdapterLoader.

## Adapter Manifest

```typescript
{
  id: 'eventbus-cache',
  name: 'Cache-backed EventBus',
  version: '1.0.0',
  implements: 'IEventBus',
  requires: {
    adapters: [{ id: 'cache', alias: 'cache' }],
    platform: '>= 1.0.0',
  },
  capabilities: {
    custom: {
      persistence: true,
      distributed: true,
      ttl: true,
      polling: true,
    },
  },
}
```

## Performance Considerations

- **Memory**: Depends on cache backend; events are JSON-serialized (~200-500 bytes per event)
- **Latency**: Polling-based, so delivery latency is up to `pollIntervalMs`
- **Throughput**: Limited by cache backend; Redis handles ~100K ops/sec

**Tuning tips:**
- Lower `pollIntervalMs` for faster delivery (more CPU/network)
- Shorter `eventTtlMs` for lower memory usage
- Use Redis cache for distributed deployments

## FAQ

<details>
<summary><strong>Q: Can I use this adapter outside KB Labs platform?</strong></summary>

No. This adapter is designed specifically for KB Labs ecosystem and depends on platform interfaces (`IEventBus`, `ICache`). Use `createAdapter()` with mock cache for standalone testing only.
</details>

<details>
<summary><strong>Q: Why polling instead of push notifications?</strong></summary>

Polling provides simpler implementation that works with any cache backend. For real-time requirements (< 100ms), consider using Redis pub/sub directly or a dedicated message broker.
</details>

<details>
<summary><strong>Q: What happens if a subscriber is slow?</strong></summary>

Events are processed sequentially per subscriber. If a handler is slow, that subscriber will lag behind. Other subscribers are not affected. Events are retained until TTL expires, so slow subscribers can catch up.
</details>

<details>
<summary><strong>Q: Are events guaranteed to be delivered exactly once?</strong></summary>

No. This is an at-least-once delivery system. If a process crashes mid-processing, events may be redelivered on restart. Design handlers to be idempotent.
</details>

<details>
<summary><strong>Q: Can I use MemoryCache in production?</strong></summary>

Not recommended. MemoryCache is single-process and loses data on restart. Use Redis for production deployments requiring persistence and distribution.
</details>

## Related Adapters

| Adapter | Use Case |
|---------|----------|
| `@kb-labs/adapters-redis` | Cache backend for distributed EventBus |
| `@kb-labs/core-platform/noop` | MemoryCache for testing/development |

## Troubleshooting

### Events not being received

**Cause**: Subscriber registered after events were published; `lastTimestamp` is newer than event timestamps.

**Solution**: Ensure subscribers are registered before publishers start, or adjust subscription logic.

### High memory usage

**Cause**: Long `eventTtlMs` with high event volume.

**Solution**: Reduce `eventTtlMs` or implement event archiving.

### Slow event delivery

**Cause**: `pollIntervalMs` too high.

**Solution**: Reduce `pollIntervalMs` (e.g., 100ms for near-real-time).

```bash
# Verify adapter is loaded
pnpm kb plugins list
```

## Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for development guidelines.

## License

[KB Public License v1.1](../../LICENSE) - KB Labs Team
