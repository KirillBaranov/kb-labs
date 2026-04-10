# @kb-labs/core-ipc

IPC transport layer for KB Labs platform — Unix sockets and Node.js process IPC for parent↔child adapter communication.

## Overview

The KB Labs sandbox model runs plugin handlers in child processes. The parent process holds real platform adapters (LLM, vector store, etc.); children call them via IPC. `core-ipc` provides the server (parent side) and transport (child side) for this RPC channel.

```
Parent process (real adapters)          Child process (plugin handler)
┌─────────────────────────────┐         ┌──────────────────────────────┐
│  IPCServer                  │ ←────── │  IPCTransport                │
│  handles: adapter:call      │ ──────→ │  send({ adapter, method })   │
│  routes to platform adapter │         │  await response              │
└─────────────────────────────┘         └──────────────────────────────┘
```

## Parent Side (CLI/daemon)

```typescript
import { IPCServer } from '@kb-labs/core-ipc';

// platform has real adapter implementations
const server = new IPCServer(platform);
server.start(); // listens on process IPC channel
```

For multi-process scenarios (Unix socket):

```typescript
import { UnixSocketServer } from '@kb-labs/core-ipc';

const server = new UnixSocketServer(platform, { socketPath: '/tmp/kb.sock' });
await server.listen();
```

## Child Side (plugin sandbox)

```typescript
import { IPCTransport } from '@kb-labs/core-ipc';

const transport = new IPCTransport({ timeout: 10_000 });

// Transparent RPC call to parent adapter
const result = await transport.send({
  type: 'adapter:call',
  adapter: 'vectorStore',
  method: 'search',
  args: [queryVector, { limit: 10 }],
});
```

## Large Message Transfer

For passing large datasets (embeddings, file contents) without blocking the IPC channel:

```typescript
import { BulkTransferHelper } from '@kb-labs/core-ipc';

const helper = new BulkTransferHelper({ chunkSize: 64 * 1024 });
await helper.send(transport, largeBuffer);
// Automatically chunks, reassembles on receiver side
```

## Timeouts

Per-operation timeouts configurable via `selectTimeout()`:

```typescript
import { selectTimeout, OPERATION_TIMEOUTS } from '@kb-labs/core-ipc';

const timeout = selectTimeout('vectorStore.search', userConfig);
// Falls back to OPERATION_TIMEOUTS defaults if not configured
```

## Errors

| Error | Description |
|-------|-------------|
| `TransportError` | IPC channel failure |
| `TimeoutError` | Operation exceeded configured timeout |
| `CircuitOpenError` | Circuit breaker tripped after repeated failures |

## License

KB Public License v1.1 © KB Labs
