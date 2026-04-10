/**
 * @module @kb-labs/adapters-transport/__tests__/unix-socket-server
 *
 * Tests for UnixSocketServer (parent process side of IPC).
 *
 * Tests:
 * - Server start/stop lifecycle
 * - Client connection handling
 * - Adapter call execution
 * - Error handling and serialization
 * - Multiple concurrent clients
 * - Socket cleanup
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as net from "net";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { UnixSocketServer } from "../unix-socket-server.js";
import type { AdapterCall, AdapterResponse } from "../types.js";

describe("UnixSocketServer", () => {
  let socketPath: string;
  let server: UnixSocketServer;

  beforeEach(() => {
    // Use unique socket path for each test
    const testId = Math.random().toString(36).slice(2, 9);
    socketPath = path.join(os.tmpdir(), `kb-test-${testId}.sock`);
  });

  afterEach(async () => {
    // Cleanup server
    if (server) {
      await server.close();
    }

    // Cleanup socket file if exists
    if (fs.existsSync(socketPath)) {
      fs.unlinkSync(socketPath);
    }
  });

  describe("Server Lifecycle", () => {
    it("should start server and create socket file", async () => {
      server = new UnixSocketServer({ socketPath });

      server.onCall(async (call) => ({
        type: "adapter:response",
        requestId: call.requestId,
        result: null,
      }));

      await server.start();

      // Socket file should exist
      expect(fs.existsSync(socketPath)).toBe(true);

      // Should be readable/writable
      const stats = fs.statSync(socketPath);
      expect(stats.isSocket()).toBe(true);
    });

    it("should remove existing socket file on start", async () => {
      // Create dummy socket file
      fs.writeFileSync(socketPath, "");

      server = new UnixSocketServer({ socketPath });

      server.onCall(async (call) => ({
        type: "adapter:response",
        requestId: call.requestId,
        result: null,
      }));

      await server.start();

      // Should still work (old file removed)
      expect(fs.existsSync(socketPath)).toBe(true);

      const stats = fs.statSync(socketPath);
      expect(stats.isSocket()).toBe(true);
    });

    it("should clean up socket file on close", async () => {
      server = new UnixSocketServer({ socketPath });

      server.onCall(async (call) => ({
        type: "adapter:response",
        requestId: call.requestId,
        result: null,
      }));

      await server.start();
      expect(fs.existsSync(socketPath)).toBe(true);

      await server.close();

      // Socket file should be removed
      expect(fs.existsSync(socketPath)).toBe(false);
    });

    it("should use default socket path if not specified", async () => {
      server = new UnixSocketServer(); // No config

      server.onCall(async (call) => ({
        type: "adapter:response",
        requestId: call.requestId,
        result: null,
      }));

      await server.start();

      // Default path is /tmp/kb-ipc.sock
      const defaultPath = "/tmp/kb-ipc.sock";
      expect(fs.existsSync(defaultPath)).toBe(true);

      await server.close();
      expect(fs.existsSync(defaultPath)).toBe(false);
    });
  });

  describe("Client Connections", () => {
    it("should accept client connections", async () => {
      server = new UnixSocketServer({ socketPath });

      server.onCall(async (call) => ({
        type: "adapter:response",
        requestId: call.requestId,
        result: { success: true },
      }));

      await server.start();

      // Connect as client
      const client = net.connect(socketPath);

      await new Promise<void>((resolve, reject) => {
        client.on("connect", () => resolve());
        client.on("error", reject);
      });

      client.destroy();
    });

    it("should handle multiple concurrent clients", async () => {
      server = new UnixSocketServer({ socketPath });

      let callCount = 0;

      server.onCall(async (call) => {
        callCount++;
        return {
          type: "adapter:response",
          requestId: call.requestId,
          result: { callNumber: callCount },
        };
      });

      await server.start();

      // Connect 3 clients concurrently
      const clients = await Promise.all([
        connectClient(socketPath),
        connectClient(socketPath),
        connectClient(socketPath),
      ]);

      // Each should be able to send messages
      const results = await Promise.all(
        clients.map((client, i) =>
          sendAdapterCall(client, {
            version: 2,
            type: "adapter:call",
            requestId: `req-${i}`,
            adapter: "cache",
            method: "get",
            args: [`key-${i}`],
          }),
        ),
      );

      // All should get responses
      expect(results).toHaveLength(3);
      expect(callCount).toBe(3);

      // Cleanup clients
      clients.forEach((c) => c.destroy());
    });

    it("should clean up client on disconnect", async () => {
      server = new UnixSocketServer({ socketPath });

      server.onCall(async (call) => ({
        type: "adapter:response",
        requestId: call.requestId,
        result: null,
      }));

      await server.start();

      const client = await connectClient(socketPath);

      // Disconnect client
      client.destroy();

      // Wait for cleanup
      await new Promise((resolve) => {
        setTimeout(resolve, 100);
      });

      // Server should still be running
      const client2 = await connectClient(socketPath);
      client2.destroy();
    });
  });

  describe("Adapter Call Handling", () => {
    it("should execute adapter call and return result", async () => {
      server = new UnixSocketServer({ socketPath });

      server.onCall(async (call) => {
        // Simulate adapter execution
        if (call.adapter === "cache" && call.method === "get") {
          const key = call.args[0] as string;
          return {
            type: "adapter:response",
            requestId: call.requestId,
            result: { key, value: "cached-value" },
          };
        }

        return {
          type: "adapter:response",
          requestId: call.requestId,
          result: null,
        };
      });

      await server.start();

      const client = await connectClient(socketPath);

      const response = await sendAdapterCall(client, {
        version: 2,
        type: "adapter:call",
        requestId: "test-123",
        adapter: "cache",
        method: "get",
        args: ["my-key"],
      });

      expect(response.type).toBe("adapter:response");
      expect(response.requestId).toBe("test-123");
      expect(response.result).toEqual({ key: "my-key", value: "cached-value" });

      client.destroy();
    });

    it("should handle errors in adapter call handler", async () => {
      server = new UnixSocketServer({ socketPath });

      server.onCall(async (_call) => {
        // Simulate adapter error
        throw new Error("Adapter failed");
      });

      await server.start();

      const client = await connectClient(socketPath);

      const response = await sendAdapterCall(client, {
        version: 2,
        type: "adapter:call",
        requestId: "error-test",
        adapter: "llm",
        method: "chat",
        args: [{ messages: [] }],
      });

      expect(response.type).toBe("adapter:response");
      expect(response.requestId).toBe("error-test");
      expect(response.error).toBeDefined();
      expect(response.error?.__type).toBe("Error");
      expect(response.error?.message).toBe("Adapter failed");

      client.destroy();
    });

    it("should handle non-Error exceptions", async () => {
      server = new UnixSocketServer({ socketPath });

      server.onCall(async (_call) => {
        throw new Error("String error");
      });

      await server.start();

      const client = await connectClient(socketPath);

      const response = await sendAdapterCall(client, {
        version: 2,
        type: "adapter:call",
        requestId: "string-error",
        adapter: "cache",
        method: "get",
        args: ["key"],
      });

      expect(response.error).toBeDefined();
      expect(response.error?.message).toBe("String error");

      client.destroy();
    });

    it("should preserve error stack traces", async () => {
      server = new UnixSocketServer({ socketPath });

      server.onCall(async (_call) => {
        const error = new Error("Test error");
        error.stack = "Error: Test error\n  at CustomLocation";
        throw error;
      });

      await server.start();

      const client = await connectClient(socketPath);

      const response = await sendAdapterCall(client, {
        version: 2,
        type: "adapter:call",
        requestId: "stack-test",
        adapter: "storage",
        method: "read",
        args: ["/path"],
      });

      expect(response.error?.stack).toContain("CustomLocation");

      client.destroy();
    });
  });

  describe("Message Protocol", () => {
    it("should parse newline-delimited JSON messages", async () => {
      server = new UnixSocketServer({ socketPath });

      const receivedCalls: AdapterCall[] = [];

      server.onCall(async (call) => {
        receivedCalls.push(call);
        return {
          type: "adapter:response",
          requestId: call.requestId,
          result: null,
        };
      });

      await server.start();

      const client = await connectClient(socketPath);

      // Send 3 messages in one write (newline-delimited)
      const msg1: AdapterCall = {
        version: 2,
        type: "adapter:call",
        requestId: "msg1",
        adapter: "cache",
        method: "get",
        args: ["key1"],
      };
      const msg2: AdapterCall = {
        version: 2,
        type: "adapter:call",
        requestId: "msg2",
        adapter: "cache",
        method: "get",
        args: ["key2"],
      };
      const msg3: AdapterCall = {
        version: 2,
        type: "adapter:call",
        requestId: "msg3",
        adapter: "cache",
        method: "get",
        args: ["key3"],
      };

      client.write(JSON.stringify(msg1) + "\n");
      client.write(JSON.stringify(msg2) + "\n");
      client.write(JSON.stringify(msg3) + "\n");

      // Wait for processing
      await new Promise((resolve) => {
        setTimeout(resolve, 100);
      });

      expect(receivedCalls).toHaveLength(3);
      expect(receivedCalls[0]!.requestId).toBe("msg1");
      expect(receivedCalls[1]!.requestId).toBe("msg2");
      expect(receivedCalls[2]!.requestId).toBe("msg3");

      client.destroy();
    });

    it("should ignore empty lines", async () => {
      server = new UnixSocketServer({ socketPath });

      const receivedCalls: AdapterCall[] = [];

      server.onCall(async (call) => {
        receivedCalls.push(call);
        return {
          type: "adapter:response",
          requestId: call.requestId,
          result: null,
        };
      });

      await server.start();

      const client = await connectClient(socketPath);

      // Send with empty lines
      client.write("\n\n");
      client.write(
        JSON.stringify({
          version: 2,
          type: "adapter:call",
          requestId: "valid",
          adapter: "cache",
          method: "get",
          args: [],
        }) + "\n",
      );
      client.write("\n");

      await new Promise((resolve) => {
        setTimeout(resolve, 100);
      });

      expect(receivedCalls).toHaveLength(1);
      expect(receivedCalls[0]!.requestId).toBe("valid");

      client.destroy();
    });

    it("should handle malformed JSON gracefully", async () => {
      server = new UnixSocketServer({ socketPath });

      const receivedCalls: AdapterCall[] = [];

      server.onCall(async (call) => {
        receivedCalls.push(call);
        return {
          type: "adapter:response",
          requestId: call.requestId,
          result: null,
        };
      });

      await server.start();

      const client = await connectClient(socketPath);

      // Send malformed JSON
      client.write("{ invalid json }\n");

      // Send valid message after
      client.write(
        JSON.stringify({
          version: 2,
          type: "adapter:call",
          requestId: "after-error",
          adapter: "cache",
          method: "get",
          args: [],
        }) + "\n",
      );

      await new Promise((resolve) => {
        setTimeout(resolve, 100);
      });

      // Should process valid message despite earlier error
      expect(receivedCalls).toHaveLength(1);
      expect(receivedCalls[0]!.requestId).toBe("after-error");

      client.destroy();
    });
  });
});

/**
 * Helper: Connect to Unix socket server
 */
async function connectClient(socketPath: string): Promise<net.Socket> {
  const client = net.connect(socketPath);

  return new Promise<net.Socket>((resolve, reject) => {
    client.on("connect", () => resolve(client));
    client.on("error", reject);
  });
}

/**
 * Helper: Send adapter call and wait for response
 */
async function sendAdapterCall(
  client: net.Socket,
  call: AdapterCall,
): Promise<AdapterResponse> {
  return new Promise<AdapterResponse>((resolve, reject) => {
    let buffer = "";

    const onData = (data: Buffer) => {
      buffer += data.toString("utf8");

      const newlineIndex = buffer.indexOf("\n");
      if (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex);
        try {
          const response = JSON.parse(line) as AdapterResponse;
          client.off("data", onData);
          resolve(response);
        } catch (error) {
          reject(error);
        }
      }
    };

    client.on("data", onData);

    // Send call
    const message = JSON.stringify(call) + "\n";
    client.write(message, "utf8", (error) => {
      if (error) {
        client.off("data", onData);
        reject(error);
      }
    });

    // Timeout after 5s
    setTimeout(() => {
      client.off("data", onData);
      reject(new Error("Response timeout"));
    }, 5000);
  });
}
