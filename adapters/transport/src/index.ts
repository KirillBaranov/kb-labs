/**
 * @module @kb-labs/adapters-transport
 * Transport adapters for inter-process communication.
 *
 * Provides pluggable transport layer for adapter calls between
 * parent and child processes. Supports IPC and Unix Sockets.
 *
 * @example
 * ```typescript
 * import { createAdapter } from '@kb-labs/adapters-transport';
 *
 * // Auto-select best transport (Unix Socket with IPC fallback)
 * const transport = createAdapter({ type: 'auto' });
 *
 * // Or explicitly choose
 * const ipcTransport = createAdapter({ type: 'ipc' });
 * const socketTransport = createAdapter({ type: 'unix-socket', socketPath: '/tmp/kb.sock' });
 * ```
 */

export * from "./transport.js";
export * from "./ipc-transport.js";
export * from "./unix-socket-transport.js";
export * from "./unix-socket-server.js";
export * from "./types.js";

import type { ITransport } from "./transport.js";
import { IPCTransport, type TransportConfig } from "./ipc-transport.js";
import {
  UnixSocketTransport,
  type UnixSocketConfig,
} from "./unix-socket-transport.js";

/**
 * Transport adapter configuration.
 */
export interface TransportAdapterConfig {
  /** Transport type */
  type: "ipc" | "unix-socket" | "auto";
  /** Socket path for Unix socket transport */
  socketPath?: string;
  /** Timeout for adapter calls */
  timeout?: number;
  /** Auto-reconnect on disconnect (Unix socket only) */
  autoReconnect?: boolean;
}

/**
 * Create transport adapter based on configuration.
 *
 * Auto mode selects Unix Socket if available, falls back to IPC.
 *
 * @param config - Transport configuration
 * @returns Transport adapter instance
 *
 * @example
 * ```typescript
 * // Auto-select best transport
 * const transport = createAdapter({ type: 'auto' });
 *
 * // Force IPC (legacy compatibility)
 * const ipcTransport = createAdapter({ type: 'ipc' });
 *
 * // Force Unix Socket (max performance)
 * const socketTransport = createAdapter({
 *   type: 'unix-socket',
 *   socketPath: '/tmp/kb-ipc.sock',
 * });
 * ```
 */
export function createAdapter(config: TransportAdapterConfig): ITransport {
  if (config.type === "unix-socket") {
    return new UnixSocketTransport({
      socketPath: config.socketPath,
      timeout: config.timeout,
      autoReconnect: config.autoReconnect,
    } as UnixSocketConfig);
  }

  if (config.type === "ipc") {
    return new IPCTransport({
      timeout: config.timeout,
    } as TransportConfig);
  }

  // Auto mode: try Unix Socket, fallback to IPC
  if (config.type === "auto") {
    // For now, default to Unix Socket for bulk operations
    // TODO: Add runtime detection and fallback
    return new UnixSocketTransport({
      socketPath: config.socketPath ?? "/tmp/kb-ipc.sock",
      timeout: config.timeout,
      autoReconnect: config.autoReconnect ?? true,
    } as UnixSocketConfig);
  }

  throw new Error(`Unknown transport type: ${config.type}`);
}

// Default export for standard adapter pattern
export default createAdapter;
