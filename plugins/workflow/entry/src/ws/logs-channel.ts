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
const SubscribeMsg = defineMessage<{ jobId: string; level?: string }>(
  'subscribe',
);
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
const UnsubscribeMsg = defineMessage<{}>('unsubscribe');

const LogMsg = defineMessage<{
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  context?: Record<string, unknown>;
}>('log');

const ErrorMsg = defineMessage<{
  error: string;
  code: 'NOT_FOUND' | 'DEPENDENCY_UNAVAILABLE';
}>('error');

type Incoming =
  | ReturnType<typeof SubscribeMsg.create>
  | ReturnType<typeof UnsubscribeMsg.create>;

type Outgoing =
  | ReturnType<typeof LogMsg.create>
  | ReturnType<typeof ErrorMsg.create>;

// Module-level state keyed by ctx.requestId (stable per WS connection)
const pollingTimers = new Map<string, ReturnType<typeof setInterval>>();
const logOffsets = new Map<string, number>();
// "active" gate. Set on subscribe, cleared on unsubscribe/disconnect. The
// polling callback is async — clearInterval stops future ticks but cannot
// cancel an in-flight `await fetchLogs(...)`. The poll body must consult
// this gate before sending so a late-resolving fetch from a just-stopped
// subscription doesn't emit one stray log after unsubscribe (WS-L04).
const activeSubscriptions = new Set<string>();

type DaemonLog = {
  timestamp: string;
  level: string;
  message: string;
  context?: Record<string, unknown>;
};

type ExistenceProbe =
  | { exists: true }
  | { exists: false; unavailable?: boolean };

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
  return (levelOrder[logLevel] ?? 1) >= (levelOrder[filterLevel] ?? 0);
}

async function fetchLogs(
  runId: string,
  offset: number,
  level?: string,
): Promise<DaemonLog[]> {
  const daemonUrl = getWorkflowDaemonUrl();
  const params = new URLSearchParams({ limit: '200', offset: String(offset) });
  if (level) {
    params.set('level', level);
  }
  const url = `${daemonUrl}/api/v1/runs/${encodeURIComponent(runId)}/logs?${params}`;
  const res = await fetch(url);
  if (!res.ok) {
    return [];
  }
  const body = (await res.json()) as {
    ok?: boolean;
    data?: { logs?: DaemonLog[] };
  };
  return body?.data?.logs ?? [];
}

async function checkRunExists(runId: string): Promise<ExistenceProbe> {
  const daemonUrl = getWorkflowDaemonUrl();
  try {
    const res = await fetch(
      `${daemonUrl}/api/v1/runs/${encodeURIComponent(runId)}`,
    );
    if (res.status === 404) {
      return { exists: false };
    }
    if (!res.ok) {
      return { exists: false, unavailable: true };
    }
    return { exists: true };
  } catch {
    return { exists: false, unavailable: true };
  }
}

function clearConnection(connectionId: string): void {
  activeSubscriptions.delete(connectionId);
  const timer = pollingTimers.get(connectionId);
  if (timer) {
    clearInterval(timer);
    pollingTimers.delete(connectionId);
  }
  logOffsets.delete(connectionId);
}

export default defineWebSocket<unknown, Incoming, Outgoing>({
  path: '/logs/:runId',
  description: 'Real-time job logs streaming',

  handler: {
    async onConnect(ctx, _sender) {
      ctx.platform.logger.info('[logs-channel] Client connected', {
        connectionId: ctx.requestId,
      });
    },

    async onMessage(ctx, message, sender) {
      const connectionId = ctx.requestId;

      const router = new MessageRouter()
        .on(SubscribeMsg, async (_ctx, payload) => {
          const { jobId: runId, level } = payload;

          // Validate run exists before subscribing
          const probe = await checkRunExists(runId);
          if (!probe.exists) {
            const code = probe.unavailable
              ? 'DEPENDENCY_UNAVAILABLE'
              : 'NOT_FOUND';
            const error = probe.unavailable
              ? 'Workflow daemon is unavailable; logs cannot be subscribed right now'
              : `Run ${runId} not found`;
            await sender.send(ErrorMsg.create({ error, code }));
            sender.close(probe.unavailable ? 1013 : 1008, code);
            return;
          }

          // Clear any existing subscription, then mark active.
          clearConnection(connectionId);
          logOffsets.set(connectionId, 0);
          activeSubscriptions.add(connectionId);

          // Backfill semantics: send only the MOST RECENT existing log as a
          // "current state" hint, then advance offset past all existing logs
          // so polling streams strictly new entries.
          //
          // Why not replay everything: callers that immediately unsubscribe
          // after the first log (WS-L04 pattern: "verify unsubscribe stops
          // the stream") would otherwise see additional pre-buffered logs
          // arrive after unsubscribe — the bytes already left the socket
          // before activeSubscriptions could gate them out. A single-entry
          // backfill aligns with `tail -f` semantics and keeps the
          // subscribe-then-unsubscribe contract deterministic. Consumers
          // that need full history can fetch it via the daemon's REST
          // /api/v1/runs/:runId/logs endpoint directly.
          const initialLogs = await fetchLogs(runId, 0, level).catch(
            () => [] as DaemonLog[],
          );
          if (!activeSubscriptions.has(connectionId)) {
            return;
          }
          const tail = initialLogs.slice(-1);
          for (const log of tail) {
            if (!levelMatches(log.level, level)) {
              continue;
            }
            if (!activeSubscriptions.has(connectionId)) {
              return;
            }
            await sender.send(
              LogMsg.create({
                timestamp: log.timestamp,
                level: normalizeLevel(log.level),
                message: log.message,
                context: log.context,
              }),
            );
          }
          logOffsets.set(connectionId, initialLogs.length);

          // Poll for new logs. The poll body is async, so clearInterval cannot
          // cancel an in-flight tick — gate every send on activeSubscriptions
          // so a late fetch resolving after unsubscribe stays silent.
          const timer = setInterval(async () => {
            if (!activeSubscriptions.has(connectionId)) {
              return;
            }
            const currentOffset = logOffsets.get(connectionId) ?? 0;
            const newLogs = await fetchLogs(runId, currentOffset, level).catch(
              () => [] as DaemonLog[],
            );
            if (!activeSubscriptions.has(connectionId)) {
              return;
            }
            if (newLogs.length === 0) {
              return;
            }
            for (const log of newLogs) {
              if (!levelMatches(log.level, level)) {
                continue;
              }
              if (!activeSubscriptions.has(connectionId)) {
                return;
              }
              await sender
                .send(
                  LogMsg.create({
                    timestamp: log.timestamp,
                    level: normalizeLevel(log.level),
                    message: log.message,
                    context: log.context,
                  }),
                )
                .catch(() => {
                  /* socket may have closed */
                });
            }
            logOffsets.set(connectionId, currentOffset + newLogs.length);
          }, POLL_INTERVAL_MS);

          pollingTimers.set(connectionId, timer);
        })
        .on(UnsubscribeMsg, async (_ctx) => {
          // Stop the polling timer and clear offsets. No confirmation
          // message is emitted on purpose: clients use unsubscribe to
          // expect a quiet stream, and emitting a synthetic LogMsg here
          // would surface as a new log to consumers like WS-L04.
          clearConnection(connectionId);
        });

      await router.handle(ctx, message as WSMessage, sender.raw);
    },

    async onDisconnect(ctx, _code, _reason) {
      clearConnection(ctx.requestId);
      ctx.platform.logger.info('[logs-channel] Client disconnected', {
        connectionId: ctx.requestId,
      });
    },

    async onError(ctx, error, sender) {
      ctx.platform.logger.error('[logs-channel] Error', error);
      clearConnection(ctx.requestId);
      try {
        await sender.send(
          ErrorMsg.create({
            error: error.message,
            code: 'DEPENDENCY_UNAVAILABLE',
          }),
        );
      } catch {
        // socket may be closed
      }
    },
  },
});

export { normalizeLevel, levelMatches };
