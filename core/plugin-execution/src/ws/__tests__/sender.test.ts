/**
 * @file Unit tests for createWSSender
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createWSSender } from '../sender.js';
import { connectionRegistry } from '../connection-registry.js';
import type { WebSocket } from 'ws';

// Mock connectionRegistry methods
vi.mock('../connection-registry.js', () => ({
  connectionRegistry: {
    broadcast: vi.fn(),
    sendTo: vi.fn(),
  },
}));

describe('createWSSender', () => {
  let mockWebSocket: WebSocket;
  const connectionId = 'test-conn-id';
  const channelPath = '/test-channel';

  beforeEach(() => {
    mockWebSocket = {
      readyState: 1, // WebSocket.OPEN
      send: vi.fn(),
      close: vi.fn(),
    } as unknown as WebSocket;

    vi.clearAllMocks();
  });

  describe('send', () => {
    it('should send message when socket is OPEN', async () => {
      const sender = createWSSender(mockWebSocket, connectionId, channelPath);
      const message = { type: 'test', payload: { data: 'hello' }, timestamp: Date.now() };

      await sender.send(message);

      expect(mockWebSocket.send).toHaveBeenCalledWith(JSON.stringify(message));
    });

    it('should not send message when socket is not OPEN', async () => {
      (mockWebSocket as any).readyState = 3; // WebSocket.CLOSED

      const sender = createWSSender(mockWebSocket, connectionId, channelPath);
      const message = { type: 'test', payload: {}, timestamp: Date.now() };

      await sender.send(message);

      expect(mockWebSocket.send).not.toHaveBeenCalled();
    });

    it('should serialize message with all fields', async () => {
      const sender = createWSSender(mockWebSocket, connectionId, channelPath);
      const message = {
        type: 'update',
        payload: { progress: 50 },
        messageId: 'msg-123',
        timestamp: 1234567890,
      };

      await sender.send(message);

      expect(mockWebSocket.send).toHaveBeenCalledWith(
        JSON.stringify({
          type: 'update',
          payload: { progress: 50 },
          messageId: 'msg-123',
          timestamp: 1234567890,
        })
      );
    });
  });

  describe('broadcast', () => {
    it('should call connectionRegistry.broadcast with channel path', async () => {
      const sender = createWSSender(mockWebSocket, connectionId, channelPath);
      const message = { type: 'test', payload: {}, timestamp: Date.now() };

      await sender.broadcast(message);

      expect(connectionRegistry.broadcast).toHaveBeenCalledWith(
        channelPath,
        message,
        connectionId
      );
    });

    it('should exclude self by default', async () => {
      const sender = createWSSender(mockWebSocket, connectionId, channelPath);
      const message = { type: 'test', payload: {}, timestamp: Date.now() };

      await sender.broadcast(message);

      expect(connectionRegistry.broadcast).toHaveBeenCalledWith(
        channelPath,
        message,
        connectionId // excludeSelf = true by default
      );
    });

    it('should not exclude self when excludeSelf = false', async () => {
      const sender = createWSSender(mockWebSocket, connectionId, channelPath);
      const message = { type: 'test', payload: {}, timestamp: Date.now() };

      await sender.broadcast(message, false);

      expect(connectionRegistry.broadcast).toHaveBeenCalledWith(
        channelPath,
        message,
        undefined // no exclusion
      );
    });

    it('should exclude self when excludeSelf = true', async () => {
      const sender = createWSSender(mockWebSocket, connectionId, channelPath);
      const message = { type: 'test', payload: {}, timestamp: Date.now() };

      await sender.broadcast(message, true);

      expect(connectionRegistry.broadcast).toHaveBeenCalledWith(
        channelPath,
        message,
        connectionId
      );
    });
  });

  describe('sendTo', () => {
    it('should call connectionRegistry.sendTo with connection IDs', async () => {
      const sender = createWSSender(mockWebSocket, connectionId, channelPath);
      const message = { type: 'test', payload: {}, timestamp: Date.now() };
      const targetIds = ['conn-1', 'conn-2', 'conn-3'];

      await sender.sendTo(targetIds, message);

      expect(connectionRegistry.sendTo).toHaveBeenCalledWith(targetIds, message);
    });

    it('should handle empty connection list', async () => {
      const sender = createWSSender(mockWebSocket, connectionId, channelPath);
      const message = { type: 'test', payload: {}, timestamp: Date.now() };

      await sender.sendTo([], message);

      expect(connectionRegistry.sendTo).toHaveBeenCalledWith([], message);
    });

    it('should handle single connection', async () => {
      const sender = createWSSender(mockWebSocket, connectionId, channelPath);
      const message = { type: 'test', payload: {}, timestamp: Date.now() };

      await sender.sendTo(['conn-1'], message);

      expect(connectionRegistry.sendTo).toHaveBeenCalledWith(['conn-1'], message);
    });
  });

  describe('close', () => {
    it('should close socket with default code 1000', () => {
      const sender = createWSSender(mockWebSocket, connectionId, channelPath);

      sender.close();

      expect(mockWebSocket.close).toHaveBeenCalledWith(1000, undefined);
    });

    it('should close socket with custom code', () => {
      const sender = createWSSender(mockWebSocket, connectionId, channelPath);

      sender.close(1001);

      expect(mockWebSocket.close).toHaveBeenCalledWith(1001, undefined);
    });

    it('should close socket with custom code and reason', () => {
      const sender = createWSSender(mockWebSocket, connectionId, channelPath);

      sender.close(1000, 'Normal closure');

      expect(mockWebSocket.close).toHaveBeenCalledWith(1000, 'Normal closure');
    });

    it('should use code 1000 when undefined provided', () => {
      const sender = createWSSender(mockWebSocket, connectionId, channelPath);

      sender.close(undefined, 'Reason only');

      expect(mockWebSocket.close).toHaveBeenCalledWith(1000, 'Reason only');
    });
  });

  describe('getConnectionId', () => {
    it('should return the connection ID', () => {
      const sender = createWSSender(mockWebSocket, connectionId, channelPath);

      expect(sender.getConnectionId()).toBe(connectionId);
    });

    it('should return correct ID for different connections', () => {
      const sender1 = createWSSender(mockWebSocket, 'conn-1', channelPath);
      const sender2 = createWSSender(mockWebSocket, 'conn-2', channelPath);

      expect(sender1.getConnectionId()).toBe('conn-1');
      expect(sender2.getConnectionId()).toBe('conn-2');
    });
  });

  describe('integration scenarios', () => {
    it('should handle sequence of operations', async () => {
      const sender = createWSSender(mockWebSocket, connectionId, channelPath);

      // Send individual message
      await sender.send({ type: 'ping', payload: {}, timestamp: Date.now() });
      expect(mockWebSocket.send).toHaveBeenCalledTimes(1);

      // Broadcast
      await sender.broadcast({ type: 'update', payload: {}, timestamp: Date.now() });
      expect(connectionRegistry.broadcast).toHaveBeenCalledTimes(1);

      // Send to specific connections
      await sender.sendTo(['conn-1'], { type: 'private', payload: {}, timestamp: Date.now() });
      expect(connectionRegistry.sendTo).toHaveBeenCalledTimes(1);

      // Close
      sender.close(1000, 'Done');
      expect(mockWebSocket.close).toHaveBeenCalledWith(1000, 'Done');
    });

    it('should handle rapid message sending', async () => {
      const sender = createWSSender(mockWebSocket, connectionId, channelPath);

      const messages = Array.from({ length: 10 }, (_, i) => ({
        type: 'batch',
        payload: { index: i },
        timestamp: Date.now(),
      }));

      for (const msg of messages) {
        await sender.send(msg);
      }

      expect(mockWebSocket.send).toHaveBeenCalledTimes(10);
    });
  });
});
