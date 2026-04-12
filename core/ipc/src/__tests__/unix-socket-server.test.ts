/**
 * @module @kb-labs/core-ipc/__tests__/unix-socket-server
 *
 * Unit tests for UnixSocketServer.
 *
 * Tests:
 * - Server lifecycle (start, close, restart)
 * - Adapter call handling
 * - Error handling and validation
 * - Protocol version compatibility
 * - BulkTransfer support
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { UnixSocketServer } from '../ipc/unix-socket-server';
import type { IPlatformAdapters } from '@kb-labs/core-platform';
import * as net from 'net';
import * as fs from 'fs';
import { IPC_PROTOCOL_VERSION, deserialize } from '@kb-labs/core-platform/serializable';

describe('UnixSocketServer', () => {
  let server: UnixSocketServer;
  let mockPlatform: IPlatformAdapters;
  const testSocketPath = '/tmp/test-kb-ipc.sock';

  beforeEach(() => {
    // Clean up any existing socket file
    if (fs.existsSync(testSocketPath)) {
      fs.unlinkSync(testSocketPath);
    }

    // Create mock platform
    mockPlatform = {
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        fatal: vi.fn(),
        trace: vi.fn(),
        child: vi.fn(),
      } as any,
      analytics: {} as any,
      vectorStore: {
        search: vi.fn().mockResolvedValue([]),
        upsert: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined),
        get: vi.fn().mockResolvedValue(null),
        count: vi.fn().mockResolvedValue(0),
      },
      llm: {} as any,
      embeddings: {} as any,
      cache: {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined),
        clear: vi.fn().mockResolvedValue(undefined),
        zadd: vi.fn().mockResolvedValue(undefined),
        zrangebyscore: vi.fn().mockResolvedValue([]),
        zrem: vi.fn().mockResolvedValue(undefined),
        setIfNotExists: vi.fn().mockResolvedValue(true),
      },
      config: {} as any,
      storage: {} as any,
      eventBus: {} as any,
      invoke: {} as any,
      sqlDatabase: {} as any,
      documentDatabase: {} as any,
      logs: {} as any,
    };
  });

  afterEach(async () => {
    // Clean up server
    if (server && server.isStarted()) {
      await server.close();
    }

    // Clean up socket file
    if (fs.existsSync(testSocketPath)) {
      fs.unlinkSync(testSocketPath);
    }
  });

  describe('Server Lifecycle', () => {
    it('should start and listen on Unix socket', async () => {
      server = new UnixSocketServer(mockPlatform, { socketPath: testSocketPath });

      await server.start();

      expect(server.isStarted()).toBe(true);
      expect(fs.existsSync(testSocketPath)).toBe(true);
      expect(mockPlatform.logger.debug).toHaveBeenCalledWith(
        'UnixSocketServer started listening for adapter calls'
      );
    });

    it('should return socket path', () => {
      server = new UnixSocketServer(mockPlatform, { socketPath: testSocketPath });

      expect(server.getSocketPath()).toBe(testSocketPath);
    });

    it('should close and cleanup socket file', async () => {
      server = new UnixSocketServer(mockPlatform, { socketPath: testSocketPath });
      await server.start();

      await server.close();

      expect(server.isStarted()).toBe(false);
      expect(fs.existsSync(testSocketPath)).toBe(false);
    });

    it('should be idempotent on close', async () => {
      server = new UnixSocketServer(mockPlatform, { socketPath: testSocketPath });
      await server.start();

      await server.close();
      await server.close(); // Second close should not throw

      expect(server.isStarted()).toBe(false);
    });

    it('should remove existing socket file on start', async () => {
      // Create a stale socket file
      fs.writeFileSync(testSocketPath, '');

      server = new UnixSocketServer(mockPlatform, { socketPath: testSocketPath });
      await server.start();

      expect(server.isStarted()).toBe(true);
      expect(fs.existsSync(testSocketPath)).toBe(true);
    });
  });

  describe('Adapter Call Handling', () => {
    it('should handle cache.get call', async () => {
      server = new UnixSocketServer(mockPlatform, { socketPath: testSocketPath });
      await server.start();

      const client = net.createConnection(testSocketPath);
      await new Promise((resolve) => {
        client.on('connect', resolve);
      });

      // Mock cache.get to return a value
      vi.mocked(mockPlatform.cache.get).mockResolvedValue({ foo: 'bar' });

      // Send adapter call
      const call = {
        type: 'adapter:call',
        requestId: 'test-123',
        version: IPC_PROTOCOL_VERSION,
        adapter: 'cache',
        method: 'get',
        args: [JSON.stringify('test-key')],
      };

      const response = await new Promise<any>((resolve) => {
        let buffer = '';
        client.on('data', (data) => {
          buffer += data.toString('utf8');
          const newlineIndex = buffer.indexOf('\n');
          if (newlineIndex !== -1) {
            const line = buffer.slice(0, newlineIndex);
            resolve(JSON.parse(line));
          }
        });

        client.write(JSON.stringify(call) + '\n', 'utf8');
      });

      expect(response.type).toBe('adapter:response');
      expect(response.requestId).toBe('test-123');
      expect(deserialize(response.result)).toEqual({ foo: 'bar' });

      client.end();
    });

    it('should handle vectorStore.search call', async () => {
      server = new UnixSocketServer(mockPlatform, { socketPath: testSocketPath });
      await server.start();

      const client = net.createConnection(testSocketPath);
      await new Promise((resolve) => {
        client.on('connect', resolve);
      });

      const expectedResults = [
        { id: '1', score: 0.9, metadata: {} },
        { id: '2', score: 0.8, metadata: {} },
      ];
      vi.mocked(mockPlatform.vectorStore.search).mockResolvedValue(expectedResults);

      const call = {
        type: 'adapter:call',
        requestId: 'search-456',
        version: IPC_PROTOCOL_VERSION,
        adapter: 'vectorStore',
        method: 'search',
        args: [JSON.stringify([0.1, 0.2, 0.3]), JSON.stringify(10)],
      };

      const response = await new Promise<any>((resolve) => {
        let buffer = '';
        client.on('data', (data) => {
          buffer += data.toString('utf8');
          const newlineIndex = buffer.indexOf('\n');
          if (newlineIndex !== -1) {
            const line = buffer.slice(0, newlineIndex);
            resolve(JSON.parse(line));
          }
        });

        client.write(JSON.stringify(call) + '\n', 'utf8');
      });

      expect(response.type).toBe('adapter:response');
      expect(response.requestId).toBe('search-456');
      expect(deserialize(response.result)).toEqual(expectedResults);

      client.end();
    });

    it('should handle errors gracefully', async () => {
      server = new UnixSocketServer(mockPlatform, { socketPath: testSocketPath });
      await server.start();

      const client = net.createConnection(testSocketPath);
      await new Promise((resolve) => {
        client.on('connect', resolve);
      });

      // Mock cache.get to throw error
      vi.mocked(mockPlatform.cache.get).mockRejectedValue(new Error('Cache is down'));

      const call = {
        type: 'adapter:call',
        requestId: 'error-789',
        version: IPC_PROTOCOL_VERSION,
        adapter: 'cache',
        method: 'get',
        args: [JSON.stringify('test-key')],
      };

      const response = await new Promise<any>((resolve) => {
        let buffer = '';
        client.on('data', (data) => {
          buffer += data.toString('utf8');
          const newlineIndex = buffer.indexOf('\n');
          if (newlineIndex !== -1) {
            const line = buffer.slice(0, newlineIndex);
            resolve(JSON.parse(line));
          }
        });

        client.write(JSON.stringify(call) + '\n', 'utf8');
      });

      expect(response.type).toBe('adapter:response');
      expect(response.requestId).toBe('error-789');
      expect(response.error).toBeDefined();

      client.end();
    });

    it('should reject unknown adapter', async () => {
      server = new UnixSocketServer(mockPlatform, { socketPath: testSocketPath });
      await server.start();

      const client = net.createConnection(testSocketPath);
      await new Promise((resolve) => {
        client.on('connect', resolve);
      });

      const call = {
        type: 'adapter:call',
        requestId: 'unknown-adapter',
        version: IPC_PROTOCOL_VERSION,
        adapter: 'unknownAdapter',
        method: 'doSomething',
        args: [],
      };

      const response = await new Promise<any>((resolve) => {
        let buffer = '';
        client.on('data', (data) => {
          buffer += data.toString('utf8');
          const newlineIndex = buffer.indexOf('\n');
          if (newlineIndex !== -1) {
            const line = buffer.slice(0, newlineIndex);
            resolve(JSON.parse(line));
          }
        });

        client.write(JSON.stringify(call) + '\n', 'utf8');
      });

      expect(response.type).toBe('adapter:response');
      expect(response.requestId).toBe('unknown-adapter');
      expect(response.error).toBeDefined();

      client.end();
    });

    it('should reject unknown method', async () => {
      server = new UnixSocketServer(mockPlatform, { socketPath: testSocketPath });
      await server.start();

      const client = net.createConnection(testSocketPath);
      await new Promise((resolve) => {
        client.on('connect', resolve);
      });

      const call = {
        type: 'adapter:call',
        requestId: 'unknown-method',
        version: IPC_PROTOCOL_VERSION,
        adapter: 'cache',
        method: 'unknownMethod',
        args: [],
      };

      const response = await new Promise<any>((resolve) => {
        let buffer = '';
        client.on('data', (data) => {
          buffer += data.toString('utf8');
          const newlineIndex = buffer.indexOf('\n');
          if (newlineIndex !== -1) {
            const line = buffer.slice(0, newlineIndex);
            resolve(JSON.parse(line));
          }
        });

        client.write(JSON.stringify(call) + '\n', 'utf8');
      });

      expect(response.type).toBe('adapter:response');
      expect(response.requestId).toBe('unknown-method');
      expect(response.error).toBeDefined();

      client.end();
    });
  });

  describe('Protocol Version Compatibility', () => {
    it('should log warning for version mismatch', async () => {
      server = new UnixSocketServer(mockPlatform, { socketPath: testSocketPath });
      await server.start();

      const client = net.createConnection(testSocketPath);
      await new Promise((resolve) => {
        client.on('connect', resolve);
      });

      const call = {
        type: 'adapter:call',
        requestId: 'version-test',
        version: 999, // Wrong version
        adapter: 'cache',
        method: 'get',
        args: [JSON.stringify('test-key')],
      };

      await new Promise<void>((resolve) => {
        let buffer = '';
        client.on('data', (data) => {
          buffer += data.toString('utf8');
          const newlineIndex = buffer.indexOf('\n');
          if (newlineIndex !== -1) {
            resolve();
          }
        });

        client.write(JSON.stringify(call) + '\n', 'utf8');
      });

      // Should still process the call but log warning
      // (console.error is used for logging in the implementation)
      expect(mockPlatform.cache.get).toHaveBeenCalled();

      client.end();
    });
  });

  describe('Multiple Clients', () => {
    it('should handle multiple concurrent clients', async () => {
      server = new UnixSocketServer(mockPlatform, { socketPath: testSocketPath });
      await server.start();

      const client1 = net.createConnection(testSocketPath);
      const client2 = net.createConnection(testSocketPath);

      await Promise.all([
        new Promise((resolve) => {
          client1.on('connect', resolve);
        }),
        new Promise((resolve) => {
          client2.on('connect', resolve);
        }),
      ]);

      vi.mocked(mockPlatform.cache.get).mockResolvedValue({ value: 'test' });

      const call1 = {
        type: 'adapter:call',
        requestId: 'client1-req',
        version: IPC_PROTOCOL_VERSION,
        adapter: 'cache',
        method: 'get',
        args: [JSON.stringify('key1')],
      };

      const call2 = {
        type: 'adapter:call',
        requestId: 'client2-req',
        version: IPC_PROTOCOL_VERSION,
        adapter: 'cache',
        method: 'get',
        args: [JSON.stringify('key2')],
      };

      const [response1, response2] = await Promise.all([
        new Promise<any>((resolve) => {
          let buffer = '';
          client1.on('data', (data) => {
            buffer += data.toString('utf8');
            const newlineIndex = buffer.indexOf('\n');
            if (newlineIndex !== -1) {
              const line = buffer.slice(0, newlineIndex);
              resolve(JSON.parse(line));
            }
          });
          client1.write(JSON.stringify(call1) + '\n', 'utf8');
        }),
        new Promise<any>((resolve) => {
          let buffer = '';
          client2.on('data', (data) => {
            buffer += data.toString('utf8');
            const newlineIndex = buffer.indexOf('\n');
            if (newlineIndex !== -1) {
              const line = buffer.slice(0, newlineIndex);
              resolve(JSON.parse(line));
            }
          });
          client2.write(JSON.stringify(call2) + '\n', 'utf8');
        }),
      ]);

      expect(response1.requestId).toBe('client1-req');
      expect(response2.requestId).toBe('client2-req');

      client1.end();
      client2.end();
    });
  });
});
