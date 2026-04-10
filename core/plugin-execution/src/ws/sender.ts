/**
 * WSSender implementation
 *
 * Provides the WSSender interface implementation for WebSocket handlers.
 */

import type { WebSocket } from 'ws';
import type { WSSender, WSMessage } from '@kb-labs/plugin-contracts';
import { connectionRegistry } from './connection-registry.js';

/**
 * Create WSSender instance for a WebSocket connection
 *
 * @param ws - WebSocket instance
 * @param connectionId - Unique connection ID
 * @param channelPath - Channel path (e.g., "/live")
 */
export function createWSSender(
  ws: WebSocket,
  connectionId: string,
  channelPath: string
): WSSender {
  return {
    async send(message: WSMessage) {
      // Only send if socket is open (readyState === 1)
      if (ws.readyState === 1) {
        ws.send(JSON.stringify(message));
      }
    },

    async broadcast(message: WSMessage, excludeSelf = true) {
      connectionRegistry.broadcast(
        channelPath,
        message,
        excludeSelf ? connectionId : undefined
      );
    },

    async sendTo(connectionIds: string[], message: WSMessage) {
      connectionRegistry.sendTo(connectionIds, message);
    },

    close(code?: number, reason?: string) {
      ws.close(code || 1000, reason);
    },

    getConnectionId() {
      return connectionId;
    },
  };
}
