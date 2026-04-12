/**
 * @module @kb-labs/core-ipc
 * IPC transport layer for inter-process communication.
 *
 * Provides Unix socket and process IPC servers/clients for parent-child
 * process communication in plugin execution system.
 *
 * ## Architecture
 *
 * Level 0: @kb-labs/core-platform (interfaces only)
 * Level 1: @kb-labs/core-ipc (transport & IPC servers) ← THIS PACKAGE
 * Level 2: @kb-labs/core-runtime (platform container, loader)
 * Level 3: @kb-labs/plugin-execution (execution backends)
 *
 * This package has ZERO dependency on core-runtime, breaking circular dependency.
 */

// ═══════════════════════════════════════════════════════════════════════════
// IPC SERVERS (Parent Process Side)
// ═══════════════════════════════════════════════════════════════════════════

export { UnixSocketServer, type UnixSocketServerConfig } from './ipc/unix-socket-server';
export { IPCServer, createIPCServer } from './ipc/ipc-server';
export { ChildIPCServer } from './ipc/child-ipc-server';

// ═══════════════════════════════════════════════════════════════════════════
// TRANSPORT LAYER (Child Process Side)
// ═══════════════════════════════════════════════════════════════════════════

export {
  type ITransport,
  type TransportConfig,
  type PendingRequest,
  TransportError,
  TimeoutError,
  CircuitOpenError,
  isRetryableError,
} from './transport/transport';

export { IPCTransport, createIPCTransport } from './transport/ipc-transport';
export { UnixSocketTransport, createUnixSocketTransport, type UnixSocketConfig } from './transport/unix-socket-transport';

// ═══════════════════════════════════════════════════════════════════════════
// BULK TRANSFER (Large Message Optimization)
// ═══════════════════════════════════════════════════════════════════════════

export { BulkTransferHelper, type BulkTransfer, type BulkTransferOptions } from './transport/bulk-transfer';

// ═══════════════════════════════════════════════════════════════════════════
// TIMEOUT CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

export { selectTimeout, getOperationTimeout, OPERATION_TIMEOUTS } from './transport/timeout-config';

// ═══════════════════════════════════════════════════════════════════════════
// SOCKET PATH (Cross-platform: Unix socket on Linux/macOS, named pipe on Windows)
// ═══════════════════════════════════════════════════════════════════════════

export { createSocketPath, DEFAULT_SOCKET_PATH } from './socket-path';

// ═══════════════════════════════════════════════════════════════════════════
// PROXY ADAPTERS (Child Process Side — proxy platform services via transport)
// ═══════════════════════════════════════════════════════════════════════════

export {
  RemoteAdapter,
  CacheProxy,
  LLMProxy,
  EmbeddingsProxy,
  VectorStoreProxy,
  StorageProxy,
  SQLDatabaseProxy,
  DocumentDatabaseProxy,
  ConfigProxy,
  createProxyPlatform,
  type CreateProxyPlatformOptions,
} from './proxy/index';
