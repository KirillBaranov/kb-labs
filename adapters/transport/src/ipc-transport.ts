/**
 * @module @kb-labs/core-runtime/transport
 * IPC transport implementation using process.send/process.on('message').
 *
 * This transport is used for communication between parent (CLI) and
 * child (sandbox worker) processes created by child_process.fork().
 *
 * Features:
 * - Thread-safe: Uses request IDs to match responses with requests
 * - Timeout enforcement: Rejects calls that exceed timeout
 * - Error propagation: Deserializes errors from parent
 * - Cleanup: Properly removes listeners on close()
 *
 * @example
 * ```typescript
 * import { IPCTransport } from '@kb-labs/core-runtime/transport';
 *
 * // In child process
 * const transport = new IPCTransport({ timeout: 10000 });
 *
 * const response = await transport.send({
 *   type: 'adapter:call',
 *   requestId: 'uuid-123',
 *   adapter: 'vectorStore',
 *   method: 'search',
 *   args: [[0.1, 0.2, 0.3], 10],
 * });
 *
 * await transport.close();
 * ```
 */

import type { AdapterCall, AdapterResponse } from "./types.js";
import { isAdapterResponse } from "./types.js";
import {
  type ITransport,
  type TransportConfig,
  type PendingRequest,
  TransportError,
  TimeoutError,
} from "./transport.js";

// Re-export TransportConfig for convenience
export type { TransportConfig };

/**
 * IPC transport using process.send/process.on('message').
 *
 * Requires:
 * - process.send() must be available (running as forked child)
 * - Parent process must listen for messages and respond
 *
 * Thread-safety:
 * - Uses Map for pending requests (safe for concurrent access in single thread)
 * - Uses request IDs to match responses (no race conditions)
 *
 * Limitations:
 * - Only works in forked child processes (not worker threads)
 * - Parent must implement IPCServer to handle calls
 * - Message size limited by Node.js IPC buffer (typically 1MB)
 */
export class IPCTransport implements ITransport {
  private pending = new Map<string, PendingRequest>();
  private messageHandler: (msg: unknown) => void;
  private closed = false;

  constructor(private config: TransportConfig = {}) {
    // Bind handler to preserve 'this' context
    this.messageHandler = this.handleMessage.bind(this);

    // Listen for responses from parent
    process.on("message", this.messageHandler);

    // Check if IPC channel is available
    if (!process.send) {
      throw new TransportError(
        "No IPC channel available. IPCTransport can only be used in forked child processes.",
      );
    }
  }

  async send(call: AdapterCall): Promise<AdapterResponse> {
    if (this.closed) {
      throw new TransportError("Transport is closed");
    }

    // Determine timeout (call-specific > config default > 30s)
    const timeout = call.timeout ?? this.config.timeout ?? 30000;

    return new Promise((resolve, reject) => {
      // Create timeout timer
      const timer = setTimeout(() => {
        this.pending.delete(call.requestId);
        reject(
          new TimeoutError(
            `Adapter call timed out after ${timeout}ms`,
            timeout,
          ),
        );
      }, timeout);

      // Store pending request
      this.pending.set(call.requestId, { resolve, reject, timer });

      // Try to send message, with backpressure handling
      this.trySendWithBackpressure(call, 0).catch((error) => {
        const pending = this.pending.get(call.requestId);
        if (pending) {
          clearTimeout(pending.timer);
          this.pending.delete(call.requestId);
          reject(error);
        }
      });
    });
  }

  /**
   * Try to send IPC message with backpressure handling.
   * If backpressure detected, waits and retries with exponential backoff.
   *
   * Note: Node.js IPC 'drain' event is unreliable, so we use sleep-based backoff instead.
   *
   * @param call - Adapter call to send
   * @param retryCount - Current retry attempt (for exponential backoff)
   */
  private async trySendWithBackpressure(
    call: AdapterCall,
    retryCount: number,
  ): Promise<void> {
    const maxRetries = 20;
    const baseDelayMs = 50;

    try {
      // process.send() is guaranteed to exist (checked in constructor)
      // Returns false if backpressure detected (buffer full)
      const sent = process.send!(call);

      if (sent) {
        // Message sent successfully
        return;
      }

      // Backpressure detected
      if (retryCount >= maxRetries) {
        throw new TransportError(
          `Failed to send IPC message after ${maxRetries} retries: persistent backpressure`,
        );
      }

      // Wait with exponential backoff (sleep instead of drain event)
      const delay = Math.min(baseDelayMs * Math.pow(1.5, retryCount), 5000); // Cap at 5s
      await new Promise((resolve) => {
        setTimeout(resolve, delay);
      });

      // Retry sending
      return this.trySendWithBackpressure(call, retryCount + 1);
    } catch (error) {
      // Synchronous error (e.g., message too large, serialization error, channel closed)
      if (error instanceof TransportError) {
        throw error;
      }
      throw new TransportError(
        `Failed to send IPC message: ${error}`,
        error as Error,
      );
    }
  }

  private handleMessage(msg: unknown) {
    // Ignore non-response messages
    if (!isAdapterResponse(msg)) {
      return;
    }

    // Find pending request
    const pending = this.pending.get(msg.requestId);
    if (!pending) {
      // Response for unknown request (may have timed out)
      return;
    }

    // Clear timeout and remove from pending
    clearTimeout(pending.timer);
    this.pending.delete(msg.requestId);

    // Resolve with response (caller will check for error field)
    pending.resolve(msg);
  }

  async close(): Promise<void> {
    if (this.closed) {
      return;
    }

    this.closed = true;

    // Remove message listener
    process.off("message", this.messageHandler);

    // Reject all pending requests
    for (const [_requestId, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new TransportError("Transport closed"));
    }
    this.pending.clear();
  }

  isClosed(): boolean {
    return this.closed;
  }
}

/**
 * Create IPCTransport with default configuration.
 *
 * @example
 * ```typescript
 * import { createIPCTransport } from '@kb-labs/core-runtime/transport';
 *
 * const transport = createIPCTransport();
 * // Use transport...
 * await transport.close();
 * ```
 */
export function createIPCTransport(config?: TransportConfig): IPCTransport {
  return new IPCTransport(config);
}
