/**
 * @module @kb-labs/plugin-execution/backends/worker-pool/worker-script
 *
 * Worker subprocess entry point.
 * This script runs in a forked process and handles IPC messages.
 */

import type {
  WorkerMessage,
  ExecuteMessage,
  ResultMessage,
  ErrorMessage,
  LogWorkerMessage,
  HealthOkMessage,
  ReadyMessage,
  ShutdownMessage,
} from './types.js';
import type { PlatformServices } from '@kb-labs/plugin-contracts';
import { createNoOpPlatform } from '@kb-labs/core-platform/noop';

// Worker state
const workerId = process.env.KB_WORKER_ID ?? 'unknown';
let isShuttingDown = false;

/**
 * Handle execute message.
 */
async function handleExecute(message: ExecuteMessage): Promise<void> {
  const { requestId, request, timeoutMs: _timeoutMs } = message;
  const startMs = Date.now();

  try {
    // Dynamic import to avoid loading at startup
    const { runInProcess } = await import('@kb-labs/plugin-runtime');
    const { noopUI } = await import('@kb-labs/plugin-contracts');
    const path = await import('node:path');
    const fs = await import('node:fs');

    // Resolve handler path — strip export name (#default, #namedExport) before fs check
    const [handlerRef = request.handlerRef] = request.handlerRef.split('#');
    const handlerPath = path.resolve(request.pluginRoot, handlerRef);

    if (!fs.existsSync(handlerPath)) {
      sendError(requestId, {
        message: `Handler not found: ${handlerPath}`,
        code: 'HANDLER_NOT_FOUND',
      });
      return;
    }

    // Create a minimal platform for worker
    // In production, this would be injected via config
    const platform = createNoOpPlatform() as unknown as PlatformServices;

    // Resolve cwd from workspace config or inherit from parent process.
    // IMPORTANT: request.pluginRoot is the plugin package directory (e.g. qa-cli/dist),
    // NOT the workspace root. Handlers expect ctx.cwd = monorepo root.
    const cwd = request.workspace?.cwd ?? process.cwd();

    // Create eventEmitter that sends log messages to pool via IPC
    const eventEmitter = async (name: string, payload?: unknown) => {
      if ((name === 'log.line' || name.endsWith(':log.line')) && payload && typeof payload === 'object') {
        const p = payload as Record<string, unknown>;
        const logMsg: LogWorkerMessage = {
          type: 'log',
          requestId,
          entry: {
            level: (p.level as string) ?? 'info',
            message: (p.line as string) ?? '',
            stream: (p.stream as 'stdout' | 'stderr') ?? 'stdout',
            lineNo: (p.lineNo as number) ?? 0,
            timestamp: new Date().toISOString(),
            meta: p.meta as Record<string, unknown> | undefined,
          },
        };
        process.send!(logMsg);
      }
    };

    // Execute handler
    const result = await runInProcess({
      descriptor: request.descriptor,
      platform,
      ui: noopUI,
      eventEmitter,
      handlerPath,
      cwd,
      input: request.input,
    });

    const elapsedMs = Date.now() - startMs;

    // Send result
    const resultMessage: ResultMessage = {
      type: 'result',
      requestId,
      result: {
        ok: true,
        data: result.data,
        executionTimeMs: elapsedMs,
        metadata: {
          backend: 'worker-pool',
          workerId,
          executionMeta: result.executionMeta,
        },
      },
    };

    process.send!(resultMessage);
  } catch (error) {
    sendError(requestId, {
      message: error instanceof Error ? error.message : String(error),
      code: 'HANDLER_ERROR',
      stack: error instanceof Error ? error.stack : undefined,
    });
  }
}

/**
 * Send error message to parent.
 */
function sendError(
  requestId: string,
  error: { message: string; code?: string; stack?: string }
): void {
  const errorMessage: ErrorMessage = {
    type: 'error',
    requestId,
    error,
  };
  process.send!(errorMessage);
}

/**
 * Handle health check.
 */
function handleHealth(): void {
  const memory = process.memoryUsage();
  const message: HealthOkMessage = {
    type: 'healthOk',
    memoryUsage: {
      heapUsed: memory.heapUsed,
      heapTotal: memory.heapTotal,
      rss: memory.rss,
    },
    uptime: process.uptime(),
  };
  process.send!(message);
}

/**
 * Handle shutdown request.
 */
function handleShutdown(message: ShutdownMessage): void {
  isShuttingDown = true;

  if (message.graceful) {
    // Let current work finish, then exit
    setTimeout(() => {
      process.exit(0);
    }, 100);
  } else {
    process.exit(0);
  }
}

/**
 * Message handler.
 */
function onMessage(message: WorkerMessage): void {
  if (isShuttingDown && message.type !== 'shutdown') {
    return;
  }

  switch (message.type) {
    case 'execute':
      handleExecute(message as ExecuteMessage);
      break;

    case 'health':
      handleHealth();
      break;

    case 'shutdown':
      handleShutdown(message as ShutdownMessage);
      break;
  }
}

// Setup IPC
process.on('message', onMessage);

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error(`[Worker ${workerId}] Uncaught exception:`, error);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error(`[Worker ${workerId}] Unhandled rejection:`, reason);
  process.exit(1);
});

// Send ready message
const readyMessage: ReadyMessage = {
  type: 'ready',
  pid: process.pid,
};
process.send!(readyMessage);
