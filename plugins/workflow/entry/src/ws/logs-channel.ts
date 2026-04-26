/**
 * @module @kb-labs/workflow-cli/ws/logs-channel
 * WebSocket channel for real-time job logs streaming
 *
 * Uses platform.logs.subscribe() to stream logs filtered by jobId (runId).
 * Clients send Subscribe message with jobId to start receiving logs.
 */

import { defineWebSocket, defineMessage, MessageRouter } from '@kb-labs/sdk';
import type { WSMessage } from '@kb-labs/sdk';
import type { LogRecord, LogQuery } from '@kb-labs/core-platform';

// Define typed messages
const SubscribeMsg = defineMessage<{ jobId: string; level?: string }>('subscribe');
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
const UnsubscribeMsg = defineMessage<{}>('unsubscribe');

const LogMsg = defineMessage<{
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  context?: Record<string, unknown>;
}>('log');

const ErrorMsg = defineMessage<{ error: string }>('error');

// Incoming/Outgoing types (discriminated unions)
type Incoming = ReturnType<typeof SubscribeMsg.create> | ReturnType<typeof UnsubscribeMsg.create>;

type Outgoing =
  | ReturnType<typeof LogMsg.create>
  | ReturnType<ReturnType<typeof defineMessage<{ jobId: string; status: string }>>['create']>
  | ReturnType<typeof ErrorMsg.create>;

// Store active subscriptions per connection
const subscriptions = new Map<string, () => void>();

/**
 * Convert LogRecord level to channel level type
 */
function normalizeLevel(level: LogRecord['level']): 'info' | 'warn' | 'error' | 'debug' {
  switch (level) {
    case 'trace':
    case 'debug':
      return 'debug';
    case 'info':
      return 'info';
    case 'warn':
      return 'warn';
    case 'error':
    case 'fatal':
      return 'error';
    default:
      return 'info';
  }
}

/**
 * Check if log level matches filter
 */
function levelMatches(logLevel: LogRecord['level'], filterLevel?: string): boolean {
  if (!filterLevel || filterLevel === 'all') {
    return true;
  }

  const levelOrder: Record<string, number> = {
    debug: 0,
    trace: 0,
    info: 1,
    warn: 2,
    error: 3,
    fatal: 3,
  };

  const logPriority = levelOrder[logLevel] ?? 1;
  const filterPriority = levelOrder[filterLevel] ?? 0;

  return logPriority >= filterPriority;
}

export default defineWebSocket<unknown, Incoming, Outgoing>({
  path: '/logs/:jobId',
  description: 'Real-time job logs streaming',

  handler: {
    async onConnect(ctx, sender) {
      const connectionId = sender.getConnectionId();
      ctx.platform.logger.info('[logs-channel] Client connected', { connectionId });

      // Check if streaming is available
      const capabilities = ctx.platform.logs.getCapabilities();
      if (!capabilities.hasStreaming) {
        await sender.send(
          ErrorMsg.create({
            error: 'Log streaming not available. Enable logRingBuffer adapter in config.',
          })
        );
        sender.close(1011, 'Streaming not available');
      }
    },

    async onMessage(ctx, message, sender) {
      const connectionId = sender.getConnectionId();

      const router = new MessageRouter()
        .on(SubscribeMsg, async (ctx, payload, _rawSender) => {
          const { jobId, level } = payload;

          ctx.platform.logger.info('[logs-channel] Subscribing to logs', { connectionId, jobId, level });

          // Unsubscribe from previous subscription if exists
          const existingUnsubscribe = subscriptions.get(connectionId);
          if (existingUnsubscribe) {
            existingUnsubscribe();
          }

          // Build filter for job logs
          const filter: LogQuery = {
            source: jobId, // Logs are tagged with jobId as source
          };

          // Subscribe to log stream
          const unsubscribe = ctx.platform.logs.subscribe((log: LogRecord) => {
            // Additional filtering by level
            if (!levelMatches(log.level, level)) {
              return;
            }

            // Also check if log belongs to this job via fields
            const logJobId = log.fields?.jobId ?? log.fields?.runId ?? log.source;
            if (logJobId !== jobId) {
              return;
            }

            // Send log to client
            sender.send(
              LogMsg.create({
                timestamp: new Date(log.timestamp).toISOString(),
                level: normalizeLevel(log.level),
                message: log.message,
                context: log.fields,
              })
            ).catch((err) => {
              ctx.platform.logger.error('[logs-channel] Failed to send log', err instanceof Error ? err : undefined);
            });
          }, filter);

          // Store unsubscribe function
          subscriptions.set(connectionId, unsubscribe);

          // Send confirmation
          await sender.send(
            LogMsg.create({
              timestamp: new Date().toISOString(),
              level: 'info',
              message: `Subscribed to logs for job ${jobId} (level: ${level || 'all'})`,
            })
          );
        })
        .on(UnsubscribeMsg, async (ctx, _payload, _rawSender) => {
          ctx.platform.logger.info('[logs-channel] Unsubscribing from logs', { connectionId });

          // Cleanup subscription
          const unsubscribe = subscriptions.get(connectionId);
          if (unsubscribe) {
            unsubscribe();
            subscriptions.delete(connectionId);
          }

          await sender.send(
            LogMsg.create({
              timestamp: new Date().toISOString(),
              level: 'info',
              message: 'Unsubscribed from logs',
            })
          );
        });

      await router.handle(ctx, message as WSMessage, sender.raw);
    },

    async onDisconnect(ctx, code, reason) {
      // Note: We don't have access to sender here, need to cleanup by other means
      // The connectionId would need to be stored during onConnect
      ctx.platform.logger.info('[logs-channel] Client disconnected', { code, reason });

      // Cleanup is handled automatically when connection is removed from registry
      // The subscription will be cleaned up when the socket closes
    },

    async onError(ctx, error, sender) {
      ctx.platform.logger.error('[logs-channel] Error', error);
      try {
        await sender.send(ErrorMsg.create({ error: error.message }));
      } catch (sendError) {
        ctx.platform.logger.error('[logs-channel] Failed to send error message', sendError instanceof Error ? sendError : undefined);
      }
    },

    cleanup() {
      // Note: This is called after each lifecycle event, not on final cleanup
      // For connection-specific cleanup, we handle it in onDisconnect and onMessage
    },
  },
});

// Export for testing
export { subscriptions, normalizeLevel, levelMatches };
