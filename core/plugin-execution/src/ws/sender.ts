/**
 * WSSender implementation
 *
 * Provides the WSSender interface implementation for WebSocket handlers.
 */

import type { WebSocket } from 'ws';
import type { WSSender, WSMessage } from '@kb-labs/plugin-contracts';
import { connectionRegistry } from './connection-registry.js';

export interface WebSocketTransportStats {
  outboundMessages: number;
  outboundBytes: number;
  droppedMessages: number;
}

interface WebSocketTelemetryLogger {
  info(fields: Record<string, unknown>, message?: string): void;
  warn(fields: Record<string, unknown>, message?: string): void;
}

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
  channelPath: string,
  telemetry?: { logger: WebSocketTelemetryLogger; stats: WebSocketTransportStats },
): WSSender {
  return {
    async send(message: WSMessage) {
      const payload = JSON.stringify(message);
      // Only send if socket is open (readyState === 1)
      if (ws.readyState === 1) {
        ws.send(payload);
        if (telemetry) {
          telemetry.stats.outboundMessages += 1;
          telemetry.stats.outboundBytes += Buffer.byteLength(payload);
          telemetry.logger.info({
            event: 'websocket.message.sent',
            'messaging.direction': 'outbound',
            'messaging.message_type': message.type,
            'messaging.message_id': message.messageId,
            payloadBytes: Buffer.byteLength(payload),
          }, '[ws] message sent');
        }
      } else if (telemetry) {
        telemetry.stats.droppedMessages += 1;
        telemetry.logger.warn({
          event: 'websocket.message.dropped',
          'messaging.direction': 'outbound',
          'messaging.message_type': message.type,
          reason: 'socket_not_open',
        }, '[ws] message dropped');
      }
    },

    async broadcast(message: WSMessage, excludeSelf = true) {
      const result = connectionRegistry.broadcast(
        channelPath,
        message,
        excludeSelf ? connectionId : undefined
      ) ?? { sent: 0, dropped: 0 };
      telemetry?.logger.info({
        event: 'websocket.broadcast.sent',
        'messaging.direction': 'outbound',
        'messaging.message_type': message.type,
        recipients: result.sent,
        droppedRecipients: result.dropped,
      }, '[ws] broadcast sent');
    },

    async sendTo(connectionIds: string[], message: WSMessage) {
      const result = connectionRegistry.sendTo(connectionIds, message) ?? { sent: 0, dropped: 0 };
      telemetry?.logger.info({
        event: 'websocket.message.sent_to',
        'messaging.direction': 'outbound',
        'messaging.message_type': message.type,
        recipients: result.sent,
        droppedRecipients: result.dropped,
      }, '[ws] targeted messages sent');
    },

    close(code?: number, reason?: string) {
      ws.close(code || 1000, reason);
    },

    getConnectionId() {
      return connectionId;
    },
  };
}
