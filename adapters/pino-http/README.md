# @kb-labs/adapters-pino-http

> Part of [KB Labs](https://github.com/KirillBaranov/kb-labs) ecosystem. Works exclusively within KB Labs platform.

Pino HTTP transport for streaming logs to KB Labs REST API.

## Features

- ✅ **Batching** - Configurable batch size and flush interval
- ✅ **Retry Logic** - Exponential backoff on HTTP failures
- ✅ **Graceful Shutdown** - Flushes pending logs before exit
- ✅ **Error Handling** - Logs to stderr if HTTP fails
- ✅ **Lightweight** - Minimal dependencies, uses native `fetch`

## Installation

```bash
pnpm add @kb-labs/adapters-pino-http
```

## Usage

### Basic Setup

```typescript
import pino from 'pino';

const logger = pino({
  transport: {
    target: '@kb-labs/adapters-pino-http',
    options: {
      url: 'http://localhost:5050/api/v1/logs/ingest',
      batchSize: 50,
      flushIntervalMs: 3000,
    },
  },
});

logger.info('Hello from Pino HTTP Transport!');
```

### With Platform DI (Recommended)

Configure in `.kb/kb.config.json`:

```json
{
  "platform": {
    "adapters": {
      "logger": "@kb-labs/adapters-pino"
    },
    "adapterOptions": {
      "logger": {
        "level": "info",
        "options": {
          "transport": {
            "target": "@kb-labs/adapters-pino-http",
            "options": {
              "url": "http://localhost:5050/api/v1/logs/ingest",
              "batchSize": 50,
              "flushIntervalMs": 3000
            }
          }
        }
      }
    }
  }
}
```

Then use in code:

```typescript
import { initPlatform } from '@kb-labs/core-platform';

const platform = await initPlatform();

platform.logger.info('This log will be sent to REST API!', {
  plugin: 'my-plugin',
  executionId: 'exec-123',
});
```

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `url` | `string` | `http://localhost:5050/api/v1/logs/ingest` | REST API endpoint for log ingestion |
| `batchSize` | `number` | `50` | Number of logs to batch before sending |
| `flushIntervalMs` | `number` | `3000` | Max time in ms to wait before flushing batch |
| `retryAttempts` | `number` | `3` | Number of retry attempts on HTTP failure |
| `retryDelayMs` | `number` | `1000` | Initial retry delay in ms (exponential backoff) |
| `headers` | `Record<string, string>` | `{}` | Custom HTTP headers (e.g., for authentication) |
| `debug` | `boolean` | `false` | Enable debug logging to stderr |

## How It Works

1. **Pino logs** are written to the transport stream
2. **Batch accumulation** - Logs are collected into a batch
3. **Flush trigger** - Batch is sent when:
   - Batch size reaches `batchSize` (immediate flush)
   - `flushIntervalMs` timer expires (delayed flush)
   - Process exits (graceful shutdown)
4. **HTTP POST** - Batch is sent to REST API with retry logic
5. **Retry on failure** - Exponential backoff (1s → 2s → 4s)
6. **Error logging** - Failures are logged to stderr

## Performance

- **Batching reduces HTTP overhead**: 50 logs/request vs 50 requests
- **Non-blocking**: Uses async `fetch`, doesn't block Pino
- **Memory-safe**: Ring buffer in REST API prevents OOM

## Debugging

Enable debug mode to see transport activity:

```json
{
  "transport": {
    "target": "@kb-labs/adapters-pino-http",
    "options": {
      "url": "http://localhost:5050/api/v1/logs/ingest",
      "debug": true
    }
  }
}
```

Output:

```
[PinoHTTP] Flushing 50 logs to http://localhost:5050/api/v1/logs/ingest
[PinoHTTP] Flush successful
[PinoHTTP] Shutting down, flushing pending logs...
[PinoHTTP] Shutdown complete
```

## License

[KB Public License v1.1](../../LICENSE) - KB Labs Team
