/**
 * @file Unit tests for ConnectionRegistry
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConnectionRegistry } from '../connection-registry.js';
import type { WebSocket } from 'ws';

describe('ConnectionRegistry', () => {
  let registry: ConnectionRegistry;
  let mockWebSocket: WebSocket;

  beforeEach(() => {
    registry = new ConnectionRegistry();
    mockWebSocket = {
      readyState: 1, // WebSocket.OPEN
      send: vi.fn(),
      close: vi.fn(),
    } as unknown as WebSocket;
  });

  describe('register', () => {
    it('should register a new connection', () => {
      registry.register({
        connectionId: 'conn-1',
        channelPath: '/test',
        socket: mockWebSocket,
        metadata: {},
      });

      const conn = registry.getConnection('conn-1');
      expect(conn).toBeDefined();
      expect(conn?.connectionId).toBe('conn-1');
      expect(conn?.channelPath).toBe('/test');
    });

    it('should track multiple connections in same channel', () => {
      const mockWs2 = { ...mockWebSocket } as unknown as WebSocket;

      registry.register({
        connectionId: 'conn-1',
        channelPath: '/test',
        socket: mockWebSocket,
        metadata: {},
      });

      registry.register({
        connectionId: 'conn-2',
        channelPath: '/test',
        socket: mockWs2,
        metadata: {},
      });

      const connections = registry.getChannelConnections('/test');
      expect(connections).toHaveLength(2);
      expect(connections.map(c => c.connectionId)).toEqual(['conn-1', 'conn-2']);
    });

    it('should track connections across different channels', () => {
      const mockWs2 = { ...mockWebSocket } as unknown as WebSocket;

      registry.register({
        connectionId: 'conn-1',
        channelPath: '/chat',
        socket: mockWebSocket,
        metadata: {},
      });

      registry.register({
        connectionId: 'conn-2',
        channelPath: '/live',
        socket: mockWs2,
        metadata: {},
      });

      expect(registry.getChannelConnections('/chat')).toHaveLength(1);
      expect(registry.getChannelConnections('/live')).toHaveLength(1);
    });

    it('should store tenant ID if provided', () => {
      registry.register({
        connectionId: 'conn-1',
        channelPath: '/test',
        socket: mockWebSocket,
        tenantId: 'acme-corp',
        metadata: {},
      });

      const conn = registry.getConnection('conn-1');
      expect(conn?.tenantId).toBe('acme-corp');
    });
  });

  describe('unregister', () => {
    it('should remove a connection', () => {
      registry.register({
        connectionId: 'conn-1',
        channelPath: '/test',
        socket: mockWebSocket,
        metadata: {},
      });

      registry.unregister('conn-1');

      const conn = registry.getConnection('conn-1');
      expect(conn).toBeUndefined();
    });

    it('should remove connection from channel tracking', () => {
      registry.register({
        connectionId: 'conn-1',
        channelPath: '/test',
        socket: mockWebSocket,
        metadata: {},
      });

      registry.unregister('conn-1');

      const connections = registry.getChannelConnections('/test');
      expect(connections).toHaveLength(0);
    });

    it('should not affect other connections in same channel', () => {
      const mockWs2 = { ...mockWebSocket } as unknown as WebSocket;

      registry.register({
        connectionId: 'conn-1',
        channelPath: '/test',
        socket: mockWebSocket,
        metadata: {},
      });

      registry.register({
        connectionId: 'conn-2',
        channelPath: '/test',
        socket: mockWs2,
        metadata: {},
      });

      registry.unregister('conn-1');

      const connections = registry.getChannelConnections('/test');
      expect(connections).toHaveLength(1);
      expect(connections[0]?.connectionId).toBe('conn-2');
    });

    it('should handle unregistering non-existent connection gracefully', () => {
      expect(() => registry.unregister('non-existent')).not.toThrow();
    });
  });

  describe('broadcast', () => {
    beforeEach(() => {
      const mockWs2 = { ...mockWebSocket, send: vi.fn() } as unknown as WebSocket;
      const mockWs3 = { ...mockWebSocket, send: vi.fn() } as unknown as WebSocket;

      registry.register({
        connectionId: 'conn-1',
        channelPath: '/test',
        socket: mockWebSocket,
        metadata: {},
      });

      registry.register({
        connectionId: 'conn-2',
        channelPath: '/test',
        socket: mockWs2,
        metadata: {},
      });

      registry.register({
        connectionId: 'conn-3',
        channelPath: '/other',
        socket: mockWs3,
        metadata: {},
      });
    });

    it('should broadcast message to all connections in channel', () => {
      const message = { type: 'test', payload: {}, timestamp: Date.now() };

      registry.broadcast('/test', message);

      const connections = registry.getChannelConnections('/test');
      connections.forEach(conn => {
        expect(conn.socket.send).toHaveBeenCalledWith(JSON.stringify(message));
      });
    });

    it('should not broadcast to other channels', () => {
      const message = { type: 'test', payload: {}, timestamp: Date.now() };

      registry.broadcast('/test', message);

      const otherConnection = registry.getConnection('conn-3');
      expect(otherConnection?.socket.send).not.toHaveBeenCalled();
    });

    it('should exclude connection when excludeConnectionId provided', () => {
      const message = { type: 'test', payload: {}, timestamp: Date.now() };

      registry.broadcast('/test', message, 'conn-1');

      const conn1 = registry.getConnection('conn-1');
      const conn2 = registry.getConnection('conn-2');

      expect(conn1?.socket.send).not.toHaveBeenCalled();
      expect(conn2?.socket.send).toHaveBeenCalledWith(JSON.stringify(message));
    });

    it('should only send to connections with OPEN readyState', () => {
      const message = { type: 'test', payload: {}, timestamp: Date.now() };

      // Close one connection
      const conn1 = registry.getConnection('conn-1')!;
      (conn1.socket as any).readyState = 3; // WebSocket.CLOSED

      registry.broadcast('/test', message);

      expect(conn1.socket.send).not.toHaveBeenCalled();

      const conn2 = registry.getConnection('conn-2');
      expect(conn2?.socket.send).toHaveBeenCalledWith(JSON.stringify(message));
    });

    it('should handle empty channel gracefully', () => {
      const message = { type: 'test', payload: {}, timestamp: Date.now() };

      expect(() => registry.broadcast('/empty-channel', message)).not.toThrow();
    });
  });

  describe('sendTo', () => {
    beforeEach(() => {
      const mockWs2 = { ...mockWebSocket, send: vi.fn() } as unknown as WebSocket;
      const mockWs3 = { ...mockWebSocket, send: vi.fn() } as unknown as WebSocket;

      registry.register({
        connectionId: 'conn-1',
        channelPath: '/test',
        socket: mockWebSocket,
        metadata: {},
      });

      registry.register({
        connectionId: 'conn-2',
        channelPath: '/test',
        socket: mockWs2,
        metadata: {},
      });

      registry.register({
        connectionId: 'conn-3',
        channelPath: '/test',
        socket: mockWs3,
        metadata: {},
      });
    });

    it('should send message to specific connections', () => {
      const message = { type: 'test', payload: {}, timestamp: Date.now() };

      registry.sendTo(['conn-1', 'conn-3'], message);

      const conn1 = registry.getConnection('conn-1');
      const conn2 = registry.getConnection('conn-2');
      const conn3 = registry.getConnection('conn-3');

      expect(conn1?.socket.send).toHaveBeenCalledWith(JSON.stringify(message));
      expect(conn2?.socket.send).not.toHaveBeenCalled();
      expect(conn3?.socket.send).toHaveBeenCalledWith(JSON.stringify(message));
    });

    it('should only send to connections with OPEN readyState', () => {
      const message = { type: 'test', payload: {}, timestamp: Date.now() };

      // Close one connection
      const conn1 = registry.getConnection('conn-1')!;
      (conn1.socket as any).readyState = 3; // WebSocket.CLOSED

      registry.sendTo(['conn-1', 'conn-2'], message);

      expect(conn1.socket.send).not.toHaveBeenCalled();

      const conn2 = registry.getConnection('conn-2');
      expect(conn2?.socket.send).toHaveBeenCalledWith(JSON.stringify(message));
    });

    it('should handle non-existent connections gracefully', () => {
      const message = { type: 'test', payload: {}, timestamp: Date.now() };

      expect(() => registry.sendTo(['non-existent'], message)).not.toThrow();
    });

    it('should handle empty connection list', () => {
      const message = { type: 'test', payload: {}, timestamp: Date.now() };

      expect(() => registry.sendTo([], message)).not.toThrow();
    });
  });

  describe('getStats', () => {
    it('should return stats for empty registry', () => {
      const stats = registry.getStats();

      expect(stats.totalConnections).toBe(0);
      expect(stats.channels).toEqual([]);
    });

    it('should return correct connection count', () => {
      const mockWs2 = { ...mockWebSocket } as unknown as WebSocket;

      registry.register({
        connectionId: 'conn-1',
        channelPath: '/test',
        socket: mockWebSocket,
        metadata: {},
      });

      registry.register({
        connectionId: 'conn-2',
        channelPath: '/test',
        socket: mockWs2,
        metadata: {},
      });

      const stats = registry.getStats();

      expect(stats.totalConnections).toBe(2);
    });

    it('should return per-channel stats', () => {
      const mockWs2 = { ...mockWebSocket } as unknown as WebSocket;
      const mockWs3 = { ...mockWebSocket } as unknown as WebSocket;

      registry.register({
        connectionId: 'conn-1',
        channelPath: '/chat',
        socket: mockWebSocket,
        metadata: {},
      });

      registry.register({
        connectionId: 'conn-2',
        channelPath: '/chat',
        socket: mockWs2,
        metadata: {},
      });

      registry.register({
        connectionId: 'conn-3',
        channelPath: '/live',
        socket: mockWs3,
        metadata: {},
      });

      const stats = registry.getStats();

      expect(stats.channels).toHaveLength(2);
      expect(stats.channels).toContainEqual({ path: '/chat', connections: 2 });
      expect(stats.channels).toContainEqual({ path: '/live', connections: 1 });
    });
  });
});
