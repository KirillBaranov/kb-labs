/**
 * @file Unit tests for defineWebSocket and message validation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { defineWebSocket, isWSHost } from '../define-websocket.js';
import type { PluginContextV3, WebSocketHostContext, WSInput, WSSender } from '@kb-labs/plugin-contracts';

describe('defineWebSocket', () => {
  let mockContext: PluginContextV3<unknown>;
  let mockSender: WSSender;
  let mockLogger: any;

  beforeEach(() => {
    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    };

    const wsHostContext: WebSocketHostContext = {
      host: 'ws',
      channelPath: '/test',
      connectionId: 'conn-123',
      clientIp: '127.0.0.1',
      headers: {},
      requestId: 'req-123',
      traceId: 'trace-123',
    };

    mockContext = {
      host: 'ws',
      hostContext: wsHostContext,
      ui: {} as any,
      platform: {
        logger: mockLogger,
      } as any,
      config: {},
    } as any;

    mockSender = {
      send: vi.fn(),
      broadcast: vi.fn(),
      sendTo: vi.fn(),
      close: vi.fn(),
      getConnectionId: vi.fn(() => 'conn-123'),
    };
  });

  describe('host validation', () => {
    it('should throw error if host is not ws', async () => {
      const handler = defineWebSocket({
        path: '/test',
        handler: {
          async onConnect() {},
        },
      });

      const invalidContext = {
        ...mockContext,
        host: 'cli' as const,
        hostContext: { host: 'cli' as const } as any,
      };

      const input: WSInput = { event: 'connect', sender: mockSender };

      await expect(
        handler.execute(invalidContext, input)
      ).rejects.toThrow('can only run in ws host');
    });

    it('should throw error if channel path mismatch', async () => {
      const handler = defineWebSocket({
        path: '/expected',
        handler: {
          async onConnect() {},
        },
      });

      const wrongPathContext = {
        ...mockContext,
        hostContext: {
          ...mockContext.hostContext,
          channelPath: '/wrong',
        } as WebSocketHostContext,
      };

      const input: WSInput = { event: 'connect', sender: mockSender };

      await expect(
        handler.execute(wrongPathContext, input)
      ).rejects.toThrow('expects channel /expected but got /wrong');
    });

    it('should throw error if sender not provided for connect event', async () => {
      const handler = defineWebSocket({
        path: '/test',
        handler: {
          async onConnect() {},
        },
      });

      const input: WSInput = { event: 'connect' }; // no sender

      await expect(
        handler.execute(mockContext, input)
      ).rejects.toThrow('WebSocket sender not provided in input');
    });

    it('should accept valid ws host context with sender', async () => {
      const onConnect = vi.fn();

      const handler = defineWebSocket({
        path: '/test',
        handler: { onConnect },
      });

      const input: WSInput = { event: 'connect', sender: mockSender };

      await handler.execute(mockContext, input);

      expect(onConnect).toHaveBeenCalled();
    });
  });

  describe('message validation', () => {
    it('should validate message structure', async () => {
      const onMessage = vi.fn();

      const handler = defineWebSocket({
        path: '/test',
        handler: { onMessage },
      });

      const validMessage = {
        type: 'test',
        payload: { data: 'hello' },
        timestamp: Date.now(),
      };

      const input: WSInput = {
        event: 'message',
        message: validMessage,
        sender: mockSender,
      };

      await handler.execute(mockContext, input);

      expect(onMessage).toHaveBeenCalled();
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('should reject message without type field', async () => {
      const onMessage = vi.fn();

      const handler = defineWebSocket({
        path: '/test',
        handler: { onMessage },
      });

      const invalidMessage = {
        payload: { data: 'hello' },
        timestamp: Date.now(),
      } as any;

      const input: WSInput = {
        event: 'message',
        message: invalidMessage,
        sender: mockSender,
      };

      await handler.execute(mockContext, input);

      expect(onMessage).not.toHaveBeenCalled();
      expect(mockContext.platform.logger.error).toHaveBeenCalled();
      expect(mockSender.send).toHaveBeenCalledWith({
        type: 'error',
        payload: { error: 'Invalid message format' },
        timestamp: expect.any(Number),
      });
    });

    it('should reject message with empty type', async () => {
      const onMessage = vi.fn();

      const handler = defineWebSocket({
        path: '/test',
        handler: { onMessage },
      });

      const invalidMessage = {
        type: '',
        payload: {},
        timestamp: Date.now(),
      };

      const input: WSInput = {
        event: 'message',
        message: invalidMessage,
        sender: mockSender,
      };

      await handler.execute(mockContext, input);

      expect(onMessage).not.toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('lifecycle events', () => {
    it('should call onConnect handler', async () => {
      const onConnect = vi.fn();

      const handler = defineWebSocket({
        path: '/test',
        handler: { onConnect },
      });

      const input: WSInput = { event: 'connect', sender: mockSender };

      await handler.execute(mockContext, input);

      expect(onConnect).toHaveBeenCalled();
    });

    it('should call onDisconnect handler without sender', async () => {
      const onDisconnect = vi.fn();

      const handler = defineWebSocket({
        path: '/test',
        handler: { onDisconnect },
      });

      // disconnect event doesn't need sender
      const input: WSInput = {
        event: 'disconnect',
        disconnectCode: 1000,
        disconnectReason: 'Normal closure',
      };

      await handler.execute(mockContext, input);

      expect(onDisconnect).toHaveBeenCalledWith(mockContext, 1000, 'Normal closure');
    });
  });

  describe('cleanup', () => {
    it('should call cleanup after successful execution', async () => {
      const cleanup = vi.fn();

      const handler = defineWebSocket({
        path: '/test',
        handler: {
          async onConnect() {},
          cleanup,
        },
      });

      const input: WSInput = { event: 'connect', sender: mockSender };

      await handler.execute(mockContext, input);

      expect(cleanup).toHaveBeenCalled();
    });

    it('should call cleanup even if handler throws', async () => {
      const cleanup = vi.fn();

      const handler = defineWebSocket({
        path: '/test',
        handler: {
          async onMessage() {
            throw new Error('Handler error');
          },
          cleanup,
        },
      });

      const message = { type: 'test', payload: {}, timestamp: Date.now() };
      const input: WSInput = { event: 'message', message, sender: mockSender };

      await expect(handler.execute(mockContext, input)).rejects.toThrow(
        'Handler error'
      );

      expect(cleanup).toHaveBeenCalled();
    });
  });
});

describe('isWSHost', () => {
  it('should return true for ws host context', () => {
    const wsContext: WebSocketHostContext = {
      host: 'ws',
      channelPath: '/test',
      connectionId: 'conn-123',
      clientIp: '127.0.0.1',
      headers: {},
      requestId: 'req-123',
      traceId: 'trace-123',
    };

    expect(isWSHost(wsContext)).toBe(true);
  });

  it('should return false for non-ws host context', () => {
    const cliContext = {
      host: 'cli' as const,
      argv: [],
      flags: {},
    };

    expect(isWSHost(cliContext)).toBe(false);
  });
});
