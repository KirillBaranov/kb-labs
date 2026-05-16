/**
 * @module @kb-labs/workflow-cli/ws/logs-channel
 * WebSocket channel for real-time job logs streaming.
 *
 * Polls the workflow daemon REST API to stream logs to the client.
 * Uses HTTP polling instead of in-process ring buffer because the daemon
 * runs in a separate process and its logs are not shared via the ring buffer.
 */

import { defineWebSocket, defineMessage, MessageRouter } from '@kb-labs/sdk';
import type { WSMessage } from '@kb-labs/sdk';
import { getWorkflowDaemonUrl } from '../http-client.js';

const POLL_INTERVAL_MS = 1_500;

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

type Incoming = ReturnType<typeof SubscribeMsg.create> | ReturnType<typeof UnsubscribeMsg.create>;

type Outgoing =
  | ReturnType<typeof LogMsg.create>
  | ReturnType<typeof ErrorMsg.create>;

// Module-level state keyed by ctx.requestId (stable per WS connection)
const pollingTimers = new Map<string, ReturnType<typeof setInterval>>();
const logOffsets = new Map<string, number>();

type DaemonLog = {
  timestamp: string;
  level: string;
  message: string;
  context?: Record<string, unknown>;
};

function normalizeLevel(level: string): 'info' | 'warn' | 'error' | 'debug' {
  switch (level) {
    case 'trace':
    case 'debug':
      return 'debug';
    case 'warn':
      return 'warn';
    case 'error':
    case 'fatal':
      return 'error';
    default:
      return 'info';
  }
}

function levelMatches(logLevel: string, filterLevel?: string): boolean {
  if (!filterLevel || filterLevel === 'all') { return true; }
  const levelOrder: Record<string, number> = { debug: 0, trace: 0, info: 1, warn: 2, error: 3, fatal: 3 };
  return (levelOrder[logLevel] ?? 1) >= (levelOrder[filterLevel] ?? 0);
}

async function fetchLogs(jobId: string, offset: number): Promise<DaemonLog[]> {
  const daemonUrl = getWorkflowDaemonUrl();
  const url = `${daemonUrl}/api/v1/jobs/${encodeURIComponent(jobId)}/logs?limit=200&offset=${offset}`;
  const res = await fetch(url);
  if (!res.ok) { return []; }
  const body = await res.json() as { ok?: boolean; data?: { logs?: DaemonLog[] } };
  return body?.data?.logs ?? [];
}

async function checkJobExists(jobId: string): Promise<boolean> {
  const daemonUrl = getWorkflowDaemonUrl();
  const res = await fetch(`${daemonUrl}/api/v1/jobs/${encodeURIComponent(jobId)}`);
  return res.status !== 404;
}

function clearConnection(connectionId: string): void {
  const timer = pollingTimers.get(connectionId);
  if (timer) { clearInterval(timer); pollingTimers.delete(connectionId); }
  logOffsets.delete(connectionId);
}

export default defineWebSocket<unknown, Incoming, Outgoing>({
  path: '/logs/:jobId',
  description: 'Real-time job logs streaming',

  handler: {
    async onConnect(ctx, _sender) {
      ctx.platform.logger.info('[logs-channel] Client connected', { connectionId: ctx.requestId });
    },

    async onMessage(ctx, message, sender) {
      const connectionId = ctx.requestId;

      const router = new MessageRouter()
        .on(SubscribeMsg, async (_ctx, payload) => {
          const { jobId, level } = payload;

          // Validate job exists before subscribing
          const exists = await checkJobExists(jobId).catch(() => true);
          if (!exists) {
            await sender.send(ErrorMsg.create({ error: `Job ${jobId} not found` }));
            sender.close(1008, 'Job not found');
            return;
          }

          // Clear any existing subscription
          clearConnection(connectionId);
          logOffsets.set(connectionId, 0);

          // Fetch and stream existing logs
          const initialLogs = await fetchLogs(jobId, 0).catch(() => [] as DaemonLog[]);
          let offset = 0;
          for (const log of initialLogs) {
            if (!levelMatches(log.level, level)) { continue; }
            await sender.send(LogMsg.create({
              timestamp: log.timestamp,
              level: normalizeLevel(log.level),
              message: log.message,
              context: log.context,
            }));
          }
          offset = initialLogs.length;
          logOffsets.set(connectionId, offset);

          // Poll for new logs
          const timer = setInterval(async () => {
            const currentOffset = logOffsets.get(connectionId) ?? 0;
            const newLogs = await fetchLogs(jobId, currentOffset).catch(() => [] as DaemonLog[]);
            if (newLogs.length === 0) { return; }
            for (const log of newLogs) {
              if (!levelMatches(log.level, level)) { continue; }
              await sender.send(LogMsg.create({
                timestamp: log.timestamp,
                level: normalizeLevel(log.level),
                message: log.message,
                context: log.context,
              })).catch(() => { /* socket may have closed */ });
            }
            logOffsets.set(connectionId, currentOffset + newLogs.length);
          }, POLL_INTERVAL_MS);

          pollingTimers.set(connectionId, timer);
        })
        .on(UnsubscribeMsg, async (_ctx) => {
          clearConnection(connectionId);
          await sender.send(LogMsg.create({
            timestamp: new Date().toISOString(),
            level: 'info',
            message: 'Unsubscribed from logs',
          }));
        });

      await router.handle(ctx, message as WSMessage, sender.raw);
    },

    async onDisconnect(ctx, _code, _reason) {
      clearConnection(ctx.requestId);
      ctx.platform.logger.info('[logs-channel] Client disconnected', { connectionId: ctx.requestId });
    },

    async onError(ctx, error, sender) {
      ctx.platform.logger.error('[logs-channel] Error', error);
      clearConnection(ctx.requestId);
      try {
        await sender.send(ErrorMsg.create({ error: error.message }));
      } catch {
        // socket may be closed
      }
    },
  },
});

export { normalizeLevel, levelMatches };
