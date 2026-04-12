/**
 * @module @kb-labs/plugin-execution/backends/worker-pool/worker-script
 *
 * Worker subprocess entry point.
 * This script runs in a forked process and handles IPC messages.
 *
 * stdio: ['pipe', 'inherit', 'inherit', 'ipc'] — stdout/stderr are inherited from
 * the parent process, so any console.log / process.stdout.write goes directly to
 * the terminal. UI output does NOT need IPC proxying.
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
import type { PlatformServices, UIFacade, MessageOptions } from '@kb-labs/plugin-contracts';
import { IPCTransport, UnixSocketTransport, createProxyPlatform } from '@kb-labs/core-ipc';
import type { ITransport } from '@kb-labs/core-ipc';
import { createGovernedPlatformServices } from '@kb-labs/plugin-runtime';
import { sideBorderBox, safeColors, safeSymbols, setJsonMode } from '@kb-labs/shared-cli-ui';

// Worker state
const workerId = process.env.KB_WORKER_ID ?? 'unknown';
let isShuttingDown = false;

/**
 * Create platform transport based on KB_PLATFORM_TRANSPORT env var.
 * Parent process sets this env via PlatformTransportFactory.type.
 *
 * Built-in types:
 * - 'ipc' (default): IPCTransport via process.send/on('message')
 * - 'unix-socket': UnixSocketTransport via KB_PLATFORM_SOCKET_PATH
 *
 * Extensible: new transport types can be added here or via dynamic import
 * of a module specified in KB_PLATFORM_TRANSPORT_MODULE env var.
 */
function createTransport(): ITransport {
  const type = process.env.KB_PLATFORM_TRANSPORT ?? 'ipc';

  switch (type) {
    case 'ipc':
      return new IPCTransport();
    case 'unix-socket': {
      const socketPath = process.env.KB_PLATFORM_SOCKET_PATH;
      if (!socketPath) {
        throw new Error('unix-socket transport requires KB_PLATFORM_SOCKET_PATH env var');
      }
      return new UnixSocketTransport({ socketPath });
    }
    default:
      throw new Error(`Unknown platform transport type: '${type}'. Set KB_PLATFORM_TRANSPORT to 'ipc' or 'unix-socket'.`);
  }
}

// Platform proxy — created once at startup, shared across all executions.
// Transport type determined by KB_PLATFORM_TRANSPORT env var (set by parent).
const transport = createTransport();
const rawProxyPlatform = createProxyPlatform({ transport });


/**
 * Create a stdout UI — same as bootstrap.ts.
 * stdout is inherited from parent so output goes directly to terminal.
 */
function createStdoutUI(): UIFacade {
  return {
    colors: safeColors,
    symbols: safeSymbols,
    write: (text: string) => { process.stdout.write(text + '\n'); },
    info: (msg: string, options?: MessageOptions) => {
      console.log(sideBorderBox({ title: options?.title || 'Info', sections: options?.sections || [{ items: [msg] }], status: 'info', timing: options?.timing }));
    },
    success: (msg: string, options?: MessageOptions) => {
      console.log(sideBorderBox({ title: options?.title || 'Success', sections: options?.sections || [{ items: [msg] }], status: 'success', timing: options?.timing }));
    },
    warn: (msg: string, options?: MessageOptions) => {
      console.log(sideBorderBox({ title: options?.title || 'Warning', sections: options?.sections || [{ items: [msg] }], status: 'warning', timing: options?.timing }));
    },
    error: (err: Error | string, options?: MessageOptions) => {
      const message = err instanceof Error ? err.message : err;
      console.error(sideBorderBox({ title: options?.title || 'Error', sections: options?.sections || [{ items: [message] }], status: 'error', timing: options?.timing }));
    },
    debug: (msg: string) => { if (process.env.DEBUG) { console.debug(msg); } },
    spinner: (msg) => {
      console.log(`⟳ ${msg}`);
      return { update: (m) => console.log(`⟳ ${m}`), succeed: (m) => console.log(`✓ ${m ?? msg}`), fail: (m) => console.log(`✗ ${m ?? msg}`), stop: () => {} };
    },
    table: (data) => console.table(data),
    json: (data) => console.log(JSON.stringify(data, null, 2)),
    newline: () => console.log(),
    divider: () => console.log('─'.repeat(40)),
    box: (content, title) => {
      if (title) { console.log(`┌─ ${title} ─┐`); }
      console.log(content);
      if (title) { console.log(`└${'─'.repeat(title.length + 4)}┘`); }
    },
    sideBox: (options) => {
      if (options.title) { console.log(`┌─ ${options.title} ─┐`); }
      if (options.sections) {
        for (const section of options.sections) {
          if (section.header) { console.log(`\n${section.header}`); }
          for (const item of section.items) { console.log(`  ${item}`); }
        }
      }
      if (options.title) { console.log(`└${'─'.repeat(options.title.length + 4)}┘`); }
    },
    confirm: async () => true,
    prompt: async () => '',
  };
}

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

    // Platform proxy: rawProxyPlatform forwards adapter calls to parent via IPC.
    // Governed wrapper adds per-plugin permission enforcement (Layer 1).
    // runInProcess() will set this as AsyncLocalStorage context so usePlatform()/useLLM()
    // return the correct governed proxy — no global singleton patching needed.
    const platform = createGovernedPlatformServices(
      rawProxyPlatform as PlatformServices,
      request.descriptor.permissions ?? {},
      request.descriptor.pluginId,
    );

    // cwd = workspace root, not plugin dir
    const cwd = request.workspace?.cwd ?? process.cwd();

    // Detect --json mode
    const inputFlags = (request.input as any)?.flags ?? {};
    const jsonMode = Boolean(inputFlags.json);
    if (jsonMode) { setJsonMode(true); }

    // UI: stdout is inherited, so console.log goes directly to terminal
    let ui: UIFacade = createStdoutUI();
    if (jsonMode) {
      ui = { ...noopUI, colors: ui.colors, symbols: ui.symbols, json: ui.json };
    }

    // eventEmitter sends log lines to parent pool via IPC
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
      ui,
      eventEmitter,
      handlerPath,
      cwd,
      input: request.input,
    });

    const elapsedMs = Date.now() - startMs;

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
  process.send!({ type: 'error', requestId, error } as ErrorMessage);
}

function handleHealth(): void {
  const memory = process.memoryUsage();
  process.send!({
    type: 'healthOk',
    memoryUsage: { heapUsed: memory.heapUsed, heapTotal: memory.heapTotal, rss: memory.rss },
    uptime: process.uptime(),
  } as HealthOkMessage);
}

function handleShutdown(message: ShutdownMessage): void {
  isShuttingDown = true;
  transport.close().catch(() => {});
  if (message.graceful) {
    setTimeout(() => process.exit(0), 100);
  } else {
    process.exit(0);
  }
}

function onMessage(message: WorkerMessage): void {
  if (isShuttingDown && message.type !== 'shutdown') { return; }
  switch (message.type) {
    case 'execute': handleExecute(message as ExecuteMessage); break;
    case 'health': handleHealth(); break;
    case 'shutdown': handleShutdown(message as ShutdownMessage); break;
  }
}

process.on('message', onMessage);

process.on('uncaughtException', (error) => {
  console.error(`[Worker ${workerId}] Uncaught exception:`, error);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error(`[Worker ${workerId}] Unhandled rejection:`, reason);
  process.exit(1);
});

process.send!({ type: 'ready', pid: process.pid } as ReadyMessage);
