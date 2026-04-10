# @kb-labs/adapters-redis

> Part of [KB Labs](https://github.com/KirillBaranov/kb-labs) ecosystem. Works exclusively within KB Labs platform.

High-performance distributed cache adapter using Redis with TTL, patterns, and atomic operations.

## Overview

| Property | Value |
|----------|-------|
| **Implements** | `ICache` |
| **Type** | `core` |
| **Requires** | None |
| **Category** | Cache |

## Features

- **TTL Support** - Automatic key expiration
- **Pattern Operations** - Scan and delete by pattern
- **Atomic Operations** - Increment, decrement, compare-and-set
- **Key Prefixing** - Namespace isolation
- **Connection Pooling** - Efficient connection management

## Installation

```bash
pnpm add @kb-labs/adapters-redis
```

## Configuration

Add to your `kb.config.json`:

```json
{
  "platform": {
    "adapters": {
      "cache": "@kb-labs/adapters-redis"
    },
    "adapterOptions": {
      "cache": {
        "host": "localhost",
        "port": 6379,
        "keyPrefix": "kb:"
      }
    }
  }
}
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `host` | `string` | `"localhost"` | Redis server host |
| `port` | `number` | `6379` | Redis server port |
| `keyPrefix` | `string` | `"kb:"` | Prefix for all cache keys |
| `password` | `string` | - | Redis password (optional) |

## Usage

### Via Platform (Recommended)

```typescript
import { usePlatform } from '@kb-labs/sdk';

const platform = usePlatform();

// Set with TTL (60 seconds)
await platform.cache.set('user:123', { name: 'John' }, 60000);

// Get
const user = await platform.cache.get<User>('user:123');

// Delete
await platform.cache.delete('user:123');

// Clear all with pattern
await platform.cache.deletePattern('user:*');
```

### Standalone (Testing/Development)

```typescript
import { createAdapter } from '@kb-labs/adapters-redis';

const cache = createAdapter({
  host: 'localhost',
  port: 6379,
  keyPrefix: 'test:'
});

await cache.set('key', 'value', 60000);
const value = await cache.get('key');
```

## Adapter Manifest

```typescript
{
  id: 'redis-cache',
  name: 'Redis Cache',
  version: '1.0.0',
  implements: 'ICache',
  capabilities: {
    custom: {
      ttl: true,
      patterns: true,
      atomic: true,
    },
  },
}
```

## FAQ

<details>
<summary><strong>Q: How do I connect to Redis with authentication?</strong></summary>

Add password to config:

```json
{
  "adapterOptions": {
    "cache": {
      "host": "redis.example.com",
      "port": 6379,
      "password": "your-password"
    }
  }
}
```
</details>

<details>
<summary><strong>Q: How do I use Redis Cluster?</strong></summary>

For cluster mode, use connection string format:

```json
{
  "adapterOptions": {
    "cache": {
      "url": "redis://node1:6379,node2:6379,node3:6379"
    }
  }
}
```
</details>

## Related Adapters

| Adapter | Use Case |
|---------|----------|
| `@kb-labs/adapters-eventbus-cache` | Event bus using cache backend |

## License

[KB Public License v1.1](../../LICENSE) - KB Labs Team
