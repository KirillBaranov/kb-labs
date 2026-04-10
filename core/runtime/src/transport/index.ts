/**
 * @module @kb-labs/core-runtime/transport
 * Transport layer for cross-process adapter communication.
 *
 * This module provides transport abstractions for sending adapter
 * method calls between parent and child processes.
 *
 * @example
 * ```typescript
 * import { ITransport, IPCTransport } from '@kb-labs/core-runtime/transport';
 *
 * const transport: ITransport = new IPCTransport();
 * const response = await transport.send(call);
 * await transport.close();
 * ```
 */

export * from './transport.js';
export * from './ipc-transport.js';
export * from './unix-socket-transport.js';
export * from './timeout-config.js';
