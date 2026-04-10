/**
 * Unix Socket Client for subprocess to parent RPC
 *
 * Connects to parent process's UnixSocketServer to access platform services.
 * Based on UnixSocketTransport from @kb-labs/adapters-transport.
 */

import * as net from 'net';

export interface UnixSocketClientConfig {
  /** Path to Unix socket file (default: /tmp/kb-ipc.sock) */
  socketPath?: string;
  /** Reconnect on disconnect (default: true) */
  autoReconnect?: boolean;
  /** Max reconnect attempts (default: 3) */
  maxReconnectAttempts?: number;
  /** Request timeout in ms (default: 30000) */
  timeout?: number;
  /** Optional auth token for parent-side IPC authorization */
  authToken?: string;
}

export interface RPCRequest {
  version: number;
  type: 'adapter:call';
  requestId: string;
  adapter: string;
  method: string;
  args: unknown[];
  timeout?: number;
  context?: {
    authToken?: string;
    executionId?: string;
    tenantId?: string;
    traceId?: string;
  };
}

export interface RPCResponse {
  type: 'adapter:response';
  requestId: string;
  result?: unknown;
  error?: unknown;
}

interface PendingRequest {
  resolve: (response: RPCResponse) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Unix Socket client for child process.
 *
 * Connects to parent's UnixSocketServer and sends RPC calls.
 */
export class UnixSocketClient {
  private socket: net.Socket | null = null;
  private pending = new Map<string, PendingRequest>();
  private closed = false;
  private connecting = false;
  private buffer = '';
  private reconnectAttempts = 0;
  private socketPath: string;
  private readonly authToken?: string;

  constructor(config: UnixSocketClientConfig = {}) {
    this.socketPath = config.socketPath ?? '/tmp/kb-ipc.sock';
    this.authToken = config.authToken;
  }

  /**
   * Connect to Unix socket server.
   */
  async connect(): Promise<void> {
    if (this.socket && !this.socket.destroyed) {
      return; // Already connected
    }

    if (this.connecting) {
      // Wait for existing connection attempt
      await new Promise((resolve) => {
        setTimeout(resolve, 100);
      });
      return this.connect();
    }

    this.connecting = true;

    return new Promise((resolve, reject) => {
      this.socket = net.connect(this.socketPath);

      this.socket.on('connect', () => {
        this.connecting = false;
        this.reconnectAttempts = 0;
        resolve();
      });

      this.socket.on('error', (error) => {
        this.connecting = false;
        reject(new Error(`Unix socket connection failed: ${error.message}`));
      });

      this.socket.on('data', (data) => {
        this.handleData(data);
      });

      this.socket.on('close', () => {
        if (!this.closed) {
          // Unexpected close
          this.socket = null;
        }
      });
    });
  }

  /**
   * Send RPC call to parent process.
   */
  async call<T = unknown>(adapter: string, method: string, args: unknown[], timeout?: number): Promise<T> {
    if (this.closed) {
      throw new Error('Client is closed');
    }

    // Ensure connected
    await this.connect();

    if (!this.socket || this.socket.destroyed) {
      throw new Error('Socket not available');
    }

    const requestId = `rpc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const timeoutMs = timeout ?? 30000;

    return new Promise<T>((resolve, reject) => {
      // Create timeout timer
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`RPC call timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      // Store pending request
      this.pending.set(requestId, {
        resolve: (response) => {
          if (response.error) {
            reject(new Error(String(response.error)));
          } else {
            resolve(response.result as T);
          }
        },
        reject,
        timer,
      });

      // Send RPC request (newline-delimited JSON)
      const request: RPCRequest = {
        version: 2,
        type: 'adapter:call',
        requestId,
        adapter,
        method,
        args,
        timeout: timeoutMs,
        context: {
          authToken: this.authToken,
          executionId: process.env.KB_EXECUTION_ID,
          tenantId: process.env.KB_TENANT_ID,
          traceId: process.env.KB_TRACE_ID,
        },
      };

      const message = JSON.stringify(request) + '\n';

      this.socket!.write(message, 'utf8', (error) => {
        if (error) {
          const pending = this.pending.get(requestId);
          if (pending) {
            clearTimeout(pending.timer);
            this.pending.delete(requestId);
            reject(new Error(`Failed to write to socket: ${error.message}`));
          }
        }
      });
    });
  }

  /**
   * Handle incoming data from Unix socket.
   */
  private handleData(data: Buffer): void {
    this.buffer += data.toString('utf8');

    // Process all complete messages (newline-delimited)
    let newlineIndex: number;
    while ((newlineIndex = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, newlineIndex);
      this.buffer = this.buffer.slice(newlineIndex + 1);

      if (line.trim().length === 0) {
        continue;
      }

      try {
        const msg = JSON.parse(line);
        this.handleMessage(msg);
      } catch (error) {
        console.error('[UnixSocketClient] Failed to parse message:', error);
      }
    }
  }

  private handleMessage(msg: unknown): void {
    if (!msg || typeof msg !== 'object' || !('type' in msg) || msg.type !== 'adapter:response') {
      return;
    }

    const response = msg as RPCResponse;

    // Find pending request
    const pending = this.pending.get(response.requestId);
    if (!pending) {
      return; // Response for unknown request
    }

    // Clear timeout and remove from pending
    clearTimeout(pending.timer);
    this.pending.delete(response.requestId);

    // Resolve with response
    pending.resolve(response);
  }

  async close(): Promise<void> {
    if (this.closed) {
      return;
    }

    this.closed = true;

    // Close socket
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }

    // Reject all pending requests
    for (const [_requestId, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Client closed'));
    }
    this.pending.clear();
  }

  isClosed(): boolean {
    return this.closed;
  }
}
