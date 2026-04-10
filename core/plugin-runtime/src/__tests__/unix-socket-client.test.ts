/**
 * @module @kb-labs/plugin-runtime/__tests__/unix-socket-client
 *
 * Tests for UnixSocketClient (subprocess side of IPC).
 *
 * Tests:
 * - Connection to Unix socket server
 * - RPC call execution
 * - Timeout handling
 * - Error handling
 * - Socket cleanup
 * - Message buffering
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as net from 'net';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { UnixSocketClient } from '../sandbox/unix-socket-client.js';
import type { RPCRequest, RPCResponse } from '../sandbox/unix-socket-client.js';

describe('UnixSocketClient', () => {
  let socketPath: string;
  let server: net.Server | null = null;
  let client: UnixSocketClient | null = null;

  beforeEach(() => {
    // Unique socket path for each test
    const testId = Math.random().toString(36).slice(2, 9);
    socketPath = path.join(os.tmpdir(), `kb-client-test-${testId}.sock`);
  });

  afterEach(async () => {
    // Cleanup client
    if (client) {
      await client.close();
      client = null;
    }

    // Cleanup server
    if (server) {
      await new Promise<void>((resolve) => {
        server!.close(() => resolve());
      });
      server = null;
    }

    // Cleanup socket file
    if (fs.existsSync(socketPath)) {
      fs.unlinkSync(socketPath);
    }
  });

  describe('Connection', () => {
    it('should connect to Unix socket server', async () => {
      // Start mock server
      server = await startMockServer(socketPath, (request) => ({
        type: 'adapter:response',
        requestId: request.requestId,
        result: null,
      }));

      client = new UnixSocketClient({ socketPath });

      await client.connect();

      expect(client.isClosed()).toBe(false);
    });

    it('should throw error if server not running', async () => {
      client = new UnixSocketClient({ socketPath });

      await expect(client.connect()).rejects.toThrow(/connection failed/i);
    });

    it('should reuse existing connection', async () => {
      server = await startMockServer(socketPath, (request) => ({
        type: 'adapter:response',
        requestId: request.requestId,
        result: null,
      }));

      client = new UnixSocketClient({ socketPath });

      await client.connect();
      await client.connect(); // Should not throw

      expect(client.isClosed()).toBe(false);
    });

    it('should use default socket path if not specified', async () => {
      const defaultPath = '/tmp/kb-ipc.sock';

      // Create server at default path
      server = await startMockServer(defaultPath, (request) => ({
        type: 'adapter:response',
        requestId: request.requestId,
        result: null,
      }));

      client = new UnixSocketClient(); // No config

      await client.connect();

      expect(client.isClosed()).toBe(false);

      // Cleanup default socket
      await client.close();
      await new Promise<void>((resolve) => {
        server!.close(() => resolve());
      });
      server = null;
      if (fs.existsSync(defaultPath)) {
        fs.unlinkSync(defaultPath);
      }
    });
  });

  describe('RPC Calls', () => {
    it('should send RPC call and receive response', async () => {
      server = await startMockServer(socketPath, (request) => {
        if (request.adapter === 'cache' && request.method === 'get') {
          return {
            type: 'adapter:response',
            requestId: request.requestId,
            result: { key: request.args[0], value: 'cached-data' },
          };
        }

        return {
          type: 'adapter:response',
          requestId: request.requestId,
          result: null,
        };
      });

      client = new UnixSocketClient({ socketPath });
      await client.connect();

      const result = await client.call('cache', 'get', ['my-key']);

      expect(result).toEqual({ key: 'my-key', value: 'cached-data' });
    });

    it('should handle multiple concurrent calls', async () => {
      server = await startMockServer(socketPath, (request) => ({
        type: 'adapter:response',
        requestId: request.requestId,
        result: { method: request.method, args: request.args },
      }));

      client = new UnixSocketClient({ socketPath });
      await client.connect();

      const [result1, result2, result3] = await Promise.all([
        client.call('cache', 'get', ['key1']),
        client.call('storage', 'read', ['/path1']),
        client.call('llm', 'chat', [{ messages: [] }]),
      ]);

      expect(result1).toEqual({ method: 'get', args: ['key1'] });
      expect(result2).toEqual({ method: 'read', args: ['/path1'] });
      expect(result3).toEqual({ method: 'chat', args: [{ messages: [] }] });
    });

    it('should reject if server returns error', async () => {
      server = await startMockServer(socketPath, (request) => ({
        type: 'adapter:response',
        requestId: request.requestId,
        error: 'Adapter error',
      }));

      client = new UnixSocketClient({ socketPath });
      await client.connect();

      await expect(client.call('cache', 'get', ['key'])).rejects.toThrow('Adapter error');
    });

    it('should timeout after specified duration', async () => {
      server = await startMockServer(socketPath, async (request) => {
        // Delay response longer than timeout
        await new Promise((resolve) => {
          setTimeout(resolve, 1000);
        });
        return {
          type: 'adapter:response',
          requestId: request.requestId,
          result: null,
        };
      });

      client = new UnixSocketClient({ socketPath });
      await client.connect();

      await expect(
        client.call('cache', 'get', ['key'], 100) // 100ms timeout
      ).rejects.toThrow(/timed out/i);
    }, 10000);

    it('should use default timeout of 30s', async () => {
      server = await startMockServer(socketPath, (request) => ({
        type: 'adapter:response',
        requestId: request.requestId,
        result: null,
      }));

      client = new UnixSocketClient({ socketPath });
      await client.connect();

      // Should not timeout with fast response
      await client.call('cache', 'get', ['key']); // No timeout param
    });
  });

  describe('Cleanup', () => {
    it('should close connection', async () => {
      server = await startMockServer(socketPath, (request) => ({
        type: 'adapter:response',
        requestId: request.requestId,
        result: null,
      }));

      client = new UnixSocketClient({ socketPath });
      await client.connect();

      expect(client.isClosed()).toBe(false);

      await client.close();

      expect(client.isClosed()).toBe(true);
    });

    it('should reject pending calls on close', async () => {
      server = await startMockServer(socketPath, async (request) => {
        // Delay to keep call pending
        await new Promise((resolve) => {
          setTimeout(resolve, 500);
        });
        return {
          type: 'adapter:response',
          requestId: request.requestId,
          result: null,
        };
      });

      client = new UnixSocketClient({ socketPath });
      await client.connect();

      // Start call but close immediately
      const callPromise = client.call('cache', 'get', ['key']);

      // Close while call is pending
      await client.close();

      // Either "Client closed" or "Socket not available" is acceptable (race condition)
      await expect(callPromise).rejects.toThrow(/Client closed|Socket not available/);
    });

    it('should throw if calling after close', async () => {
      server = await startMockServer(socketPath, (request) => ({
        type: 'adapter:response',
        requestId: request.requestId,
        result: null,
      }));

      client = new UnixSocketClient({ socketPath });
      await client.connect();

      await client.close();

      await expect(client.call('cache', 'get', ['key'])).rejects.toThrow('Client is closed');
    });

    it('should allow multiple close calls', async () => {
      server = await startMockServer(socketPath, (request) => ({
        type: 'adapter:response',
        requestId: request.requestId,
        result: null,
      }));

      client = new UnixSocketClient({ socketPath });
      await client.connect();

      await client.close();
      await client.close(); // Should not throw
    });
  });

  describe('Message Protocol', () => {
    it('should send newline-delimited JSON', async () => {
      const receivedMessages: string[] = [];

      server = net.createServer((socket) => {
        let buffer = '';

        socket.on('data', (data) => {
          buffer += data.toString('utf8');

          let newlineIndex: number;
          while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
            const line = buffer.slice(0, newlineIndex);
            buffer = buffer.slice(newlineIndex + 1);

            if (line.trim()) {
              receivedMessages.push(line);

              // Send response
              const request = JSON.parse(line) as RPCRequest;
              const response: RPCResponse = {
                type: 'adapter:response',
                requestId: request.requestId,
                result: null,
              };
              socket.write(JSON.stringify(response) + '\n');
            }
          }
        });
      });

      await new Promise<void>((resolve, reject) => {
        if (fs.existsSync(socketPath)) {
          fs.unlinkSync(socketPath);
        }
        server!.listen(socketPath, () => {
          fs.chmodSync(socketPath, 0o666);
          resolve();
        });
        server!.on('error', reject);
      });

      client = new UnixSocketClient({ socketPath });
      await client.connect();

      await client.call('cache', 'get', ['key']);

      expect(receivedMessages).toHaveLength(1);
      expect(receivedMessages[0]).toContain('"type":"adapter:call"');
      expect(receivedMessages[0]).toContain('"adapter":"cache"');
      expect(receivedMessages[0]).toContain('"method":"get"');
    });

    it('should handle buffered responses', async () => {
      server = net.createServer((socket) => {
        socket.on('data', (data) => {
          const request = JSON.parse(data.toString('utf8').trim()) as RPCRequest;

          // Send 3 responses at once (buffered)
          const resp1: RPCResponse = {
            type: 'adapter:response',
            requestId: request.requestId,
            result: { value: 1 },
          };
          const resp2: RPCResponse = {
            type: 'adapter:response',
            requestId: 'other-request',
            result: { value: 2 },
          };
          const resp3: RPCResponse = {
            type: 'adapter:response',
            requestId: 'another-request',
            result: { value: 3 },
          };

          // Send all at once
          socket.write(
            JSON.stringify(resp1) + '\n' + JSON.stringify(resp2) + '\n' + JSON.stringify(resp3) + '\n'
          );
        });
      });

      await new Promise<void>((resolve, reject) => {
        if (fs.existsSync(socketPath)) {
          fs.unlinkSync(socketPath);
        }
        server!.listen(socketPath, () => {
          fs.chmodSync(socketPath, 0o666);
          resolve();
        });
        server!.on('error', reject);
      });

      client = new UnixSocketClient({ socketPath });
      await client.connect();

      const result = await client.call('cache', 'get', ['key']);

      // Should correctly parse the buffered response
      expect(result).toEqual({ value: 1 });
    });
  });
});

/**
 * Helper: Start mock Unix socket server
 */
async function startMockServer(
  socketPath: string,
  handler: (request: RPCRequest) => RPCResponse | Promise<RPCResponse>
): Promise<net.Server> {
  const server = net.createServer((socket) => {
    let buffer = '';

    socket.on('data', async (data) => {
      buffer += data.toString('utf8');

      let newlineIndex: number;
      while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);

        if (line.trim().length === 0) {
          continue;
        }

        try {
          const request = JSON.parse(line) as RPCRequest;
          const response = await handler(request);
          socket.write(JSON.stringify(response) + '\n', 'utf8');
        } catch (error) {
          console.error('[MockServer] Error handling request:', error);
        }
      }
    });
  });

  return new Promise<net.Server>((resolve, reject) => {
    // Remove existing socket
    if (fs.existsSync(socketPath)) {
      fs.unlinkSync(socketPath);
    }

    server.listen(socketPath, () => {
      // Set permissions
      fs.chmodSync(socketPath, 0o666);
      resolve(server);
    });

    server.on('error', reject);
  });
}
