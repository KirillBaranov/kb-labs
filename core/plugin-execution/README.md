# @kb-labs/plugin-execution

Universal execution layer for KB Labs plugins — runs handlers in-process, subprocess, or worker pool.

## Overview

Provides a unified `IExecutionBackend` interface with pluggable backends, workspace isolation per execution, WebSocket channel support, and structured error handling. The backend is selected via `createExecutionBackend()` based on configuration.

## Quick Start

```typescript
import { createExecutionBackend } from '@kb-labs/plugin-execution';

const backend = createExecutionBackend({
  platform,
  type: 'in-process', // or 'worker-pool', 'subprocess'
});

const result = await backend.execute({
  pluginId: '@my-org/my-plugin',
  handlerId: 'run',
  input: { args: ['--verbose'] },
  context: contextDescriptor,
});
```

## Backends

| Backend | Description | Use case |
|---------|-------------|----------|
| `InProcessBackend` | Runs handler in same Node.js process | Development, trusted plugins |
| `WorkerPoolBackend` | Runs in Node.js worker threads | CPU-bound handlers, isolation |
| `SubprocessBackend` | Spawns child process per execution | Full isolation, untrusted plugins |

## Workspace Management

Each execution gets an isolated artifact directory via `WorkspaceManager`:

```typescript
import { WorkspaceManager } from '@kb-labs/plugin-execution';

const workspace = new WorkspaceManager({ root: '/tmp/kb-workspaces' });
const lease = await workspace.acquire(executionId);

// lease.dir — temporary directory for this execution
// Automatically cleaned up on lease release
await lease.release();
```

## WebSocket Channels

For plugins that need real-time bidirectional communication:

```typescript
import { mountWebSocketChannels } from '@kb-labs/plugin-execution';

mountWebSocketChannels(server, manifest, { backend, connectionRegistry });
```

## Errors

| Error | Code | Description |
|-------|------|-------------|
| `HandlerNotFoundError` | `HANDLER_NOT_FOUND` | Plugin handler ID not registered |
| `TimeoutError` | `TIMEOUT` | Execution exceeded time limit |
| `PermissionDeniedError` | `PERMISSION_DENIED` | Handler lacks required permission |
| `QueueFullError` | `QUEUE_FULL` | Worker pool queue at capacity |
| `WorkerCrashedError` | `WORKER_CRASHED` | Worker thread/process died unexpectedly |

## License

KB Public License v1.1 © KB Labs
