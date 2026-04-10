/**
 * @module @kb-labs/adapters-transport
 * Unix Socket server for handling adapter calls from child processes.
 *
 * This server runs in the parent process and handles incoming adapter
 * method calls from child processes connected via Unix sockets.
 *
 * @example
 * ```typescript
 * import { UnixSocketServer } from '@kb-labs/adapters-transport';
 * import { usePlatform } from '@kb-labs/core-runtime';
 *
 * const server = new UnixSocketServer({ socketPath: '/tmp/kb-ipc.sock' });
 *
 * server.onCall(async (call) => {
 *   const platform = usePlatform();
 *   const adapter = platform.getAdapter(call.adapter);
 *   const result = await adapter[call.method](...call.args);
 *   return { requestId: call.requestId, result };
 * });
 *
 * await server.start();
 * ```
 */

import * as net from "net";
import * as fs from "fs";
import type { AdapterCall, AdapterResponse } from "./types.js";

export interface UnixSocketServerConfig {
  /** Path to Unix socket file (default: /tmp/kb-ipc.sock) */
  socketPath?: string;
}

/**
 * Unix Socket server for parent process.
 *
 * Listens for adapter calls from child processes and executes them
 * on the real adapters in the parent process.
 */
export class UnixSocketServer {
  private server: net.Server | null = null;
  private clients = new Set<net.Socket>();
  private callHandler?: (call: AdapterCall) => Promise<AdapterResponse>;
  private socketPath: string;

  constructor(private config: UnixSocketServerConfig = {}) {
    this.socketPath = config.socketPath ?? "/tmp/kb-ipc.sock";
  }

  /**
   * Register handler for incoming adapter calls.
   *
   * @param handler - Async function that executes adapter call and returns response
   */
  onCall(handler: (call: AdapterCall) => Promise<AdapterResponse>): void {
    this.callHandler = handler;
  }

  /**
   * Start listening for connections.
   */
  async start(): Promise<void> {
    // Remove existing socket file if exists
    if (fs.existsSync(this.socketPath)) {
      fs.unlinkSync(this.socketPath);
    }

    return new Promise((resolve, reject) => {
      this.server = net.createServer((socket) => {
        this.handleClient(socket);
      });

      this.server.on("error", (error) => {
        reject(error);
      });

      this.server.listen(this.socketPath, () => {
        // Set socket permissions (readable/writable by all)
        fs.chmodSync(this.socketPath, 0o666);
        resolve();
      });
    });
  }

  /**
   * Handle new client connection.
   */
  private handleClient(socket: net.Socket): void {
    this.clients.add(socket);

    let buffer = "";

    socket.on("data", (data) => {
      buffer += data.toString("utf8");

      // Process all complete messages (newline-delimited)
      let newlineIndex: number;
      while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);

        if (line.trim().length === 0) {
          continue;
        }

        try {
          const call = JSON.parse(line) as AdapterCall;
          this.handleCall(socket, call);
        } catch (error) {
          console.error("[UnixSocketServer] Failed to parse message:", error);
        }
      }
    });

    socket.on("close", () => {
      this.clients.delete(socket);
    });

    socket.on("error", (error) => {
      console.error("[UnixSocketServer] Client socket error:", error);
      this.clients.delete(socket);
    });
  }

  /**
   * Handle adapter call from client.
   */
  private async handleCall(
    socket: net.Socket,
    call: AdapterCall,
  ): Promise<void> {
    if (!this.callHandler) {
      console.error("[UnixSocketServer] No call handler registered");
      return;
    }

    try {
      const response = await this.callHandler(call);
      const message = JSON.stringify(response) + "\n";
      socket.write(message, "utf8");
    } catch (error) {
      // Send error response
      const errorResponse: AdapterResponse = {
        type: "adapter:response",
        requestId: call.requestId,
        error: {
          __type: "Error",
          name: error instanceof Error ? error.name : "Error",
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
      };
      const message = JSON.stringify(errorResponse) + "\n";
      socket.write(message, "utf8");
    }
  }

  /**
   * Stop server and close all connections.
   */
  async close(): Promise<void> {
    // Close all client connections
    for (const client of this.clients) {
      client.destroy();
    }
    this.clients.clear();

    // Close server
    if (this.server) {
      await new Promise<void>((resolve) => {
        this.server!.close(() => {
          resolve();
        });
      });
      this.server = null;
    }

    // Remove socket file
    if (fs.existsSync(this.socketPath)) {
      fs.unlinkSync(this.socketPath);
    }
  }
}

/**
 * Create UnixSocketServer.
 */
export function createUnixSocketServer(
  config?: UnixSocketServerConfig,
): UnixSocketServer {
  return new UnixSocketServer(config);
}
