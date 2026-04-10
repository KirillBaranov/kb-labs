# @kb-labs/adapters-transport

> Part of [KB Labs](https://github.com/KirillBaranov/kb-labs) ecosystem. Works exclusively within KB Labs platform.

Transport layer for inter-process communication between parent and child processes. Supports IPC and Unix Sockets.

## Overview

| Property | Value |
|----------|-------|
| **Implements** | `ITransport` |
| **Type** | Infrastructure |
| **Requires** | None |
| **Category** | IPC / Networking |

## Features

- **Multiple Transports** - IPC, Unix Sockets, or auto-select
- **Serialization** - Handle Buffer, Date, Error, and complex objects
- **Auto-Reconnect** - Automatic reconnection for Unix sockets
- **Timeout Support** - Configurable request timeouts
- **Protocol Versioning** - Backward-compatible protocol

## Installation

```bash
pnpm add @kb-labs/adapters-transport
```

## Configuration

### Auto Mode (Recommended)

```typescript
import { createAdapter } from '@kb-labs/adapters-transport';

// Auto-select best transport (Unix Socket with IPC fallback)
const transport = createAdapter({ type: 'auto' });
```

### IPC Transport

```typescript
// Force IPC (legacy compatibility)
const transport = createAdapter({
  type: 'ipc',
  timeout: 30000
});
```

### Unix Socket Transport

```typescript
// Force Unix Socket (max performance)
const transport = createAdapter({
  type: 'unix-socket',
  socketPath: '/tmp/kb-ipc.sock',
  timeout: 30000,
  autoReconnect: true
});
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `type` | `'ipc' \| 'unix-socket' \| 'auto'` | - | Transport type |
| `socketPath` | `string` | `'/tmp/kb-ipc.sock'` | Unix socket path |
| `timeout` | `number` | `30000` | Request timeout in ms |
| `autoReconnect` | `boolean` | `true` | Auto-reconnect (Unix socket only) |

## Usage

### Sending Adapter Calls

```typescript
import { createAdapter } from '@kb-labs/adapters-transport';
import type { AdapterCall, AdapterResponse } from '@kb-labs/adapters-transport';

const transport = createAdapter({ type: 'auto' });

// Connect
await transport.connect();

// Send call
const call: AdapterCall = {
  version: 2,
  type: 'adapter:call',
  requestId: 'req-123',
  adapter: 'cache',
  method: 'get',
  args: ['key'],
  timeout: 5000
};

const response: AdapterResponse = await transport.send(call);

// Disconnect
await transport.disconnect();
```

### Unix Socket Server

```typescript
import { UnixSocketServer } from '@kb-labs/adapters-transport';

const server = new UnixSocketServer({
  socketPath: '/tmp/kb-ipc.sock'
});

server.on('call', async (call, respond) => {
  // Handle adapter call
  const result = await processCall(call);
  respond({ type: 'adapter:response', requestId: call.requestId, result });
});

await server.start();
```

## Serializable Types

The transport layer handles special types:

```typescript
// Buffer
{ __type: 'Buffer', data: 'base64-encoded' }

// Date
{ __type: 'Date', iso: '2024-01-01T00:00:00.000Z' }

// Error
{ __type: 'Error', name: 'Error', message: 'Something failed', stack: '...' }
```

## Transport Comparison

| Feature | IPC | Unix Socket |
|---------|-----|-------------|
| **Performance** | Good | Better |
| **Streaming** | Limited | Full support |
| **Cross-process** | Child only | Any process |
| **Reconnection** | No | Yes |
| **Platform** | All | Unix/macOS |

## FAQ

<details>
<summary><strong>Q: When should I use IPC vs Unix Socket?</strong></summary>

- Use **IPC** when spawning child processes with `child_process.fork()`
- Use **Unix Socket** for daemon processes or higher throughput
- Use **auto** to let the system choose the best option
</details>

<details>
<summary><strong>Q: What happens if the server disconnects?</strong></summary>

With `autoReconnect: true`, Unix Socket transport will automatically reconnect when the server becomes available again.
</details>

## Related Packages

| Package | Use Case |
|---------|----------|
| `@kb-labs/core-runtime` | Uses transport for plugin sandbox IPC |
| `@kb-labs/plugin-execution` | Plugin execution with transport layer |

## License

[KB Public License v1.1](../../LICENSE) - KB Labs Team
