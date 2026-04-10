/**
 * @module @kb-labs/core-runtime/ipc
 * IPC server for handling adapter calls from child processes.
 *
 * The IPCServer runs in the parent process (CLI bin) and listens for
 * adapter method calls from child processes (sandbox workers).
 *
 * When a call arrives:
 * 1. Deserializes the arguments
 * 2. Executes the method on the real adapter (e.g., QdrantVectorStore)
 * 3. Serializes the result or error
 * 4. Sends response back to child
 *
 * @example
 * ```typescript
 * import { IPCServer } from '@kb-labs/core-runtime/ipc';
 * import { platform } from '@kb-labs/core-runtime';
 *
 * // In CLI bin after initPlatform()
 * const ipcServer = new IPCServer(platform);
 * ipcServer.start();
 *
 * // Server now handles all IPC adapter calls
 * ```
 */

import type { IPlatformAdapters } from '@kb-labs/core-platform';
import type { AdapterResponse } from '@kb-labs/core-platform/serializable';
import { isAdapterCall, serialize, deserialize, IPC_PROTOCOL_VERSION } from '@kb-labs/core-platform/serializable';

/**
 * IPC server for handling adapter calls from child processes.
 *
 * Responsibilities:
 * - Listen for adapter calls on process 'message' event
 * - Validate and route calls to correct adapter
 * - Execute methods with deserialized arguments
 * - Serialize and send responses back
 * - Handle errors gracefully
 */
export class IPCServer {
  private messageHandler: (msg: unknown, sendHandle: unknown) => void;
  private started = false;

  /**
   * Create an IPC server.
   *
   * @param platform - Platform container with real adapters
   */
  constructor(private readonly platform: IPlatformAdapters) {
    // Bind handler to preserve 'this' context
    this.messageHandler = this.handleMessage.bind(this);
  }

  /**
   * Start listening for IPC messages.
   *
   * Call this in the parent process (CLI bin) after initPlatform().
   * The server will handle all adapter calls from child processes.
   *
   * @throws Error if already started
   * @throws Error if not running in parent process with IPC
   */
  start(): void {
    if (this.started) {
      throw new Error('IPCServer already started');
    }

    // Check if we can listen for messages
    if (typeof process.on !== 'function') {
      throw new Error('IPCServer requires Node.js process object');
    }

    // Listen for messages from child processes
    process.on('message', this.messageHandler);
    this.started = true;

    console.error('[IPCServer] Started listening for adapter calls');
  }

  /**
   * Stop listening for IPC messages.
   *
   * Removes the message listener. Pending calls will not receive responses.
   */
  stop(): void {
    if (!this.started) {
      return;
    }

    process.off('message', this.messageHandler);
    this.started = false;

    console.error('[IPCServer] Stopped listening for adapter calls');
  }

  /**
   * Handle incoming IPC message.
   *
   * Validates message format, executes adapter call, and sends response.
   */
  private async handleMessage(msg: unknown, sendHandle: unknown): Promise<void> {
    // Ignore non-adapter-call messages
    if (!isAdapterCall(msg)) {
      return;
    }

    // Check protocol version compatibility
    if (msg.version !== IPC_PROTOCOL_VERSION) {
      console.error('[IPCServer] Protocol version mismatch:', {
        received: msg.version,
        expected: IPC_PROTOCOL_VERSION,
        adapter: msg.adapter,
        method: msg.method,
        note: 'Child process may be using outdated protocol. Consider rebuilding.',
      });
    }

    // Log context for debugging/tracing (if provided)
    if (msg.context) {
      console.error('[IPCServer] Adapter call context:', {
        version: msg.version,
        traceId: msg.context.traceId,
        pluginId: msg.context.pluginId,
        sessionId: msg.context.sessionId,
        tenantId: msg.context.tenantId,
        adapter: msg.adapter,
        method: msg.method,
      });
    }

    try {
      // Get the adapter from platform
      const adapter = this.getAdapter(msg.adapter);

      // Get the method on the adapter
      const method = (adapter as any)[msg.method];

      if (typeof method !== 'function') {
        throw new Error(
          `Method '${msg.method}' not found on adapter '${msg.adapter}'. ` +
            `Available methods: ${Object.getOwnPropertyNames(Object.getPrototypeOf(adapter)).join(', ')}`
        );
      }

      // Deserialize arguments
      const args = msg.args.map((arg) => deserialize(arg));

      // Execute method on adapter
      const result = await method.apply(adapter, args);

      // Serialize and send successful response
      const response: AdapterResponse = {
        type: 'adapter:response',
        requestId: msg.requestId,
        result: serialize(result),
      };

      if (process.send) {
        process.send(response);
      }
    } catch (error) {
      // Serialize and send error response
      const response: AdapterResponse = {
        type: 'adapter:response',
        requestId: msg.requestId,
        error: serialize(error) as any,
      };

      if (process.send) {
        process.send(response);
      }

      // Log error for debugging
      console.error(
        `[IPCServer] Error handling adapter call: ${msg.adapter}.${msg.method}`,
        error
      );
    }
  }

  /**
   * Get adapter instance from platform container.
   *
   * @param name - Adapter name (e.g., 'vectorStore', 'cache')
   * @returns Adapter instance
   * @throws Error if adapter not found
   */
  private getAdapter(name: string): unknown {
    switch (name) {
      case 'vectorStore':
        return this.platform.vectorStore;
      case 'cache':
        return this.platform.cache;
      case 'llm':
        return this.platform.llm;
      case 'embeddings':
        return this.platform.embeddings;
      case 'storage':
        return this.platform.storage;
      case 'logger':
        return this.platform.logger;
      case 'analytics':
        return this.platform.analytics;
      case 'eventBus':
        return this.platform.eventBus;
      case 'invoke':
        return this.platform.invoke;
      default:
        throw new Error(
          `Unknown adapter: '${name}'. Valid adapters: vectorStore, cache, llm, embeddings, storage, logger, analytics, eventBus, invoke`
        );
    }
  }

  /**
   * Check if server is started.
   */
  isStarted(): boolean {
    return this.started;
  }
}

/**
 * Create and start an IPC server.
 *
 * Convenience function that creates the server and starts it immediately.
 *
 * @param platform - Platform container with real adapters
 * @returns Started IPC server instance
 *
 * @example
 * ```typescript
 * import { createIPCServer } from '@kb-labs/core-runtime/ipc';
 * import { platform } from '@kb-labs/core-runtime';
 *
 * const server = createIPCServer(platform);
 * // Server is now handling IPC calls
 * ```
 */
export function createIPCServer(platform: IPlatformAdapters): IPCServer {
  const server = new IPCServer(platform);
  server.start();
  return server;
}
