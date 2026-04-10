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

export * from './transport';
export * from './ipc-transport';
export * from './unix-socket-transport';
export * from './timeout-config';
export * from './bulk-transfer';
