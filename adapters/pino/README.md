# @kb-labs/adapters-pino

> Part of [KB Labs](https://github.com/KirillBaranov/kb-labs) ecosystem. Works exclusively within KB Labs platform.

Production-ready structured logger based on Pino with streaming and analytics integration.

## Overview

| Property | Value |
|----------|-------|
| **Implements** | `ILogger` |
| **Type** | `core` |
| **Requires** | None (optional: `analytics`) |
| **Category** | Logging |

## Features

- **Structured Logging** - JSON-formatted logs with context
- **High Performance** - Built on Pino (fastest Node.js logger)
- **Log Levels** - trace, debug, info, warn, error, fatal
- **Pretty Printing** - Human-readable output for development
- **Streaming Support** - Buffered log streaming

## Installation

```bash
pnpm add @kb-labs/adapters-pino
```

## Configuration

Add to your `kb.config.json`:

```json
{
  "platform": {
    "adapters": {
      "logger": "@kb-labs/adapters-pino"
    },
    "adapterOptions": {
      "logger": {
        "level": "info",
        "pretty": false,
        "streaming": {
          "enabled": true,
          "bufferSize": 1000,
          "bufferMaxAge": 3600000
        }
      }
    }
  }
}
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `level` | `string` | `"info"` | Minimum log level |
| `pretty` | `boolean` | `false` | Enable pretty printing for development |
| `streaming.enabled` | `boolean` | `false` | Enable log streaming/buffering |
| `streaming.bufferSize` | `number` | `1000` | Buffer size for streaming |
| `streaming.bufferMaxAge` | `number` | `3600000` | Max age of buffered logs (1 hour) |

## Usage

### Via Platform (Recommended)

```typescript
import { usePlatform } from '@kb-labs/sdk';

const platform = usePlatform();

// Basic logging
platform.logger.info('Server started', { port: 3000 });
platform.logger.error('Request failed', { error, requestId });

// With child logger
const reqLogger = platform.logger.child({ requestId: 'req-123' });
reqLogger.info('Processing request');
```

### Standalone (Testing/Development)

```typescript
import { createAdapter } from '@kb-labs/adapters-pino';

const logger = createAdapter({
  level: 'debug',
  pretty: true
});

logger.info('Hello, world!');
```

## Adapter Manifest

```typescript
{
  id: 'pino-logger',
  name: 'Pino Logger',
  version: '1.0.0',
  implements: 'ILogger',
  optional: {
    adapters: ['analytics'],
  },
  capabilities: {
    streaming: true,
  },
}
```

## Log Levels

| Level | When to use |
|-------|-------------|
| `trace` | Very detailed debugging info |
| `debug` | Debugging information |
| `info` | General operational events |
| `warn` | Warning conditions |
| `error` | Error conditions |
| `fatal` | System is unusable |

## FAQ

<details>
<summary><strong>Q: How do I enable pretty printing in development?</strong></summary>

Set `pretty: true` in config or use environment:

```bash
KB_LOG_PRETTY=true pnpm dev
```
</details>

<details>
<summary><strong>Q: How do I send logs to remote service?</strong></summary>

Use `@kb-labs/adapters-pino-http` as a transport to stream logs to REST API.
</details>

## Related Adapters

| Adapter | Use Case |
|---------|----------|
| `@kb-labs/adapters-pino-http` | HTTP transport for remote logging |
| `@kb-labs/adapters-log-ringbuffer` | In-memory log streaming |
| `@kb-labs/adapters-log-sqlite` | Persistent log storage |

## License

[KB Public License v1.1](../../LICENSE) - KB Labs Team
