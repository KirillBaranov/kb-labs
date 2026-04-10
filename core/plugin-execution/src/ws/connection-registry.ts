/**
 * WebSocket Connection Registry
 *
 * Tracks all active WebSocket connections for broadcast and targeted messaging.
 * Singleton pattern ensures all channels share the same connection state.
 */

import type { WebSocket } from 'ws';
import type { WSMessage } from '@kb-labs/plugin-contracts';

/**
 * Connection metadata
 */
export interface ConnectionInfo {
  /** Unique connection ID */
  connectionId: string;
  /** Channel path (e.g., "/live", "/chat") */
  channelPath: string;
  /** WebSocket instance */
  socket: WebSocket;
  /** Tenant ID for multi-tenancy (optional) */
  tenantId?: string;
  /** Custom metadata */
  metadata: Record<string, unknown>;
}

/**
 * Connection registry for tracking and broadcasting
 */
export class ConnectionRegistry {
  private connections = new Map<string, ConnectionInfo>();
  private channelConnections = new Map<string, Set<string>>();

  /**
   * Register a new connection
   */
  register(info: ConnectionInfo): void {
    this.connections.set(info.connectionId, info);

    if (!this.channelConnections.has(info.channelPath)) {
      this.channelConnections.set(info.channelPath, new Set());
    }
    this.channelConnections.get(info.channelPath)!.add(info.connectionId);
  }

  /**
   * Unregister a connection
   */
  unregister(connectionId: string): void {
    const info = this.connections.get(connectionId);
    if (info) {
      this.connections.delete(connectionId);
      this.channelConnections.get(info.channelPath)?.delete(connectionId);
    }
  }

  /**
   * Get connection by ID
   */
  getConnection(connectionId: string): ConnectionInfo | undefined {
    return this.connections.get(connectionId);
  }

  /**
   * Get all connections for a channel
   */
  getChannelConnections(channelPath: string): ConnectionInfo[] {
    const connectionIds = this.channelConnections.get(channelPath) || new Set();
    return Array.from(connectionIds)
      .map(id => this.connections.get(id))
      .filter((info): info is ConnectionInfo => info !== undefined);
  }

  /**
   * Broadcast message to all connections in a channel
   *
   * @param channelPath - Channel path
   * @param message - Message to broadcast
   * @param excludeConnectionId - Optional connection ID to exclude from broadcast
   */
  broadcast(channelPath: string, message: WSMessage, excludeConnectionId?: string): void {
    const connections = this.getChannelConnections(channelPath);
    const payload = JSON.stringify(message);

    for (const conn of connections) {
      if (excludeConnectionId && conn.connectionId === excludeConnectionId) {
        continue;
      }

      // Only send if socket is open (readyState === 1)
      if (conn.socket.readyState === 1) {
        conn.socket.send(payload);
      }
    }
  }

  /**
   * Send message to specific connections
   *
   * @param connectionIds - Array of connection IDs
   * @param message - Message to send
   */
  sendTo(connectionIds: string[], message: WSMessage): void {
    const payload = JSON.stringify(message);

    for (const connectionId of connectionIds) {
      const conn = this.connections.get(connectionId);
      if (conn && conn.socket.readyState === 1) {
        conn.socket.send(payload);
      }
    }
  }

  /**
   * Get registry statistics
   */
  getStats() {
    return {
      totalConnections: this.connections.size,
      channels: Array.from(this.channelConnections.entries()).map(([path, ids]) => ({
        path,
        connections: ids.size,
      })),
    };
  }
}

// Singleton instance
export const connectionRegistry = new ConnectionRegistry();
