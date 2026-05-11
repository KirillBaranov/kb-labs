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
  UIPromptMessage,
  UIPromptResultMessage,
} from './types.js';
import type { PlatformServices, UIFacade, MessageOptions } from '@kb-labs/plugin-contracts';
import { IPCTransport, UnixSocketTransport, createProxyPlatform } from '@kb-labs/core-ipc';
import type { ITransport } from '@kb-labs/core-ipc';
import { createGovernedPlatformServices } from '@kb-labs/plugin-runtime';
import { sideBorderBox, safeColors, safeSymbols, formatTable, setJsonMode } from '@kb-labs/shared-cli-ui';

// Worker state
const workerId = process.env.KB_WORKER_ID ?? 'unknown';

// Pending IPC prompt resolvers keyed by promptId
const pendingPrompts = new Map<string, (value: unknown) => void>();
let promptCounter = 0;

/**
 * Send a UI prompt request to the host via IPC and await the result.
 * Falls back to defaultValue if IPC is unavailable or times out.
 */
async function ipcPrompt(
  requestId: string,
  prompt: Omit<UIPromptMessage, 'type' | 'promptId' | 'requestId'>,
  defaultValue: unknown,
  timeoutMs = 60_000,
): Promise<unknown> {
  if (!process.send) {return defaultValue;}

  const promptId = `prompt-${workerId}-${++promptCounter}`;
  const msg: UIPromptMessage = { type: 'uiPrompt', promptId, requestId, ...prompt };

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pendingPrompts.delete(promptId);
      resolve(defaultValue);
    }, timeoutMs);

    pendingPrompts.set(promptId, (value) => {
      clearTimeout(timer);
      resolve(value);
    });

    process.send!(msg);
  });
}
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
 * Create a stdout UI with IPC proxy for interactive prompts.
 * stdout is inherited from parent so display output goes directly to terminal.
 * Interactive methods (select/multiSelect/confirm/prompt) are forwarded to the
 * host process via IPC and the result is awaited.
 */
function createStdoutUI(currentRequestId?: string): UIFacade {
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
      console.log(`${safeColors.primary('◆')} ${msg}`);
      return {
        update: (m) => console.log(`${safeColors.primary('◆')} ${m}`),
        succeed: (m) => console.log(`${safeColors.success('✓')} ${m ?? msg}`),
        fail: (m) => console.log(`${safeColors.error('✗')} ${m ?? msg}`),
        stop: () => {},
      };
    },
    table: (data, columns) => {
      if (data.length === 0) return;
      const cols = columns ?? Object.keys(data[0]!).map(k => ({ header: k, key: k }));
      const rows = data.map(row => cols.map(col => String(row[col.key] ?? '')));
      const lines = formatTable(
        cols.map(c => ({ header: c.header, align: (c as { align?: 'left' | 'center' | 'right' }).align })),
        rows,
        { separator: '' },
      );
      for (const line of lines) { console.log(`  ${line}`); }
    },
    json: (data) => console.log(JSON.stringify(data, null, 2)),
    newline: () => console.log(),
    divider: () => console.log(safeColors.muted('─'.repeat(process.stdout.columns || 80))),
    box: (content, title) => {
      console.log(sideBorderBox({
        title: title || '',
        sections: [{ items: content.split('\n') }],
        status: 'info',
      }));
    },
    sideBox: (options) => {
      console.log(sideBorderBox({
        title: options.title,
        sections: (options.sections ?? []).map(s => ({ header: s.header, items: s.items })),
        status: options.status,
        timing: options.timing,
      }));
    },
    confirm: async (msg, opts) => {
      const defaultValue = opts?.defaultValue ?? false;
      if (!currentRequestId) {return defaultValue;}
      return ipcPrompt(currentRequestId, { kind: 'confirm', message: msg, defaultValue }, defaultValue) as Promise<boolean>;
    },

    prompt: async (msg, opts) => {
      const defaultValue = opts?.default ?? '';
      if (!currentRequestId) {return defaultValue;}
      return ipcPrompt(currentRequestId, { kind: 'text', message: msg, defaultValue }, defaultValue) as Promise<string>;
    },

    select: async (msg, choices) => {
      const defaultValue = choices[0]?.value;
      if (!currentRequestId) {return defaultValue as never;}
      return ipcPrompt(currentRequestId, { kind: 'select', message: msg, choices, defaultValue }, defaultValue) as Promise<never>;
    },

    multiSelect: async (msg, choices) => {
      const defaultValue = choices.filter((c) => c.checked).map((c) => c.value);
      if (!currentRequestId) {return defaultValue as never;}
      return ipcPrompt(currentRequestId, { kind: 'multiSelect', message: msg, choices, defaultValue }, defaultValue) as Promise<never>;
    },
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
    const { runInProcess, createStreamingUI } = await import('@kb-labs/plugin-runtime');
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

    // Pre-initialize EmbeddingsProxy dimensions via IPC (cached after first call).
    // Required before any handler accesses platform.embeddings.dimensions synchronously.
    const embProxy = rawProxyPlatform.embeddings as unknown as { getDimensions?: () => Promise<number> };
    if (typeof embProxy.getDimensions === 'function') {
      await embProxy.getDimensions().catch(() => {});
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
    const rawInput = request.input;
    const inputAsObj = (typeof rawInput === 'object' && rawInput !== null) ? rawInput as Record<string, unknown> : {};
    const inputFlagsRaw = inputAsObj['flags'];
    const inputFlags: Record<string, unknown> = (typeof inputFlagsRaw === 'object' && inputFlagsRaw !== null)
      ? inputFlagsRaw as Record<string, unknown>
      : {};
    const jsonMode = Boolean(inputFlags['json']);
    if (jsonMode) { setJsonMode(true); }

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

    // UI: wrap with StreamingUI so ui.info/warn/error/write also reach the log stream.
    // In json mode keep a minimal UI but still stream through eventEmitter.
    const baseUI: UIFacade = jsonMode
      ? { ...noopUI, colors: createStdoutUI(requestId).colors, symbols: createStdoutUI(requestId).symbols, json: createStdoutUI(requestId).json }
      : createStdoutUI(requestId);
    const ui: UIFacade = createStreamingUI(baseUI, eventEmitter);

    // Intercept raw stdout/stderr to capture console.log() and third-party output.
    // Safe here: this is an isolated child process handling exactly one request at a time.
    const ANSI_RE = /\x1b\[[0-9;]*m/g;
    let rawLineNo = 0;
    const sendRawLine = (text: string, stream: 'stdout' | 'stderr') => {
      const clean = text.replace(ANSI_RE, '');
      for (const line of clean.split('\n')) {
        if (!line.trim()) { continue; }
        rawLineNo++;
        process.send!({
          type: 'log', requestId,
          entry: { level: stream === 'stderr' ? 'error' : 'info', message: line, stream, lineNo: rawLineNo, timestamp: new Date().toISOString() },
        } satisfies LogWorkerMessage);
      }
    };

    type WriteFn = (chunk: string | Uint8Array, encoding?: BufferEncoding | ((err?: Error | null) => void), cb?: (err?: Error | null) => void) => boolean;
    const origStdoutWrite = process.stdout.write.bind(process.stdout) as WriteFn;
    const origStderrWrite = process.stderr.write.bind(process.stderr) as WriteFn;
    const makeCapture = (orig: WriteFn, stream: 'stdout' | 'stderr'): WriteFn =>
      (chunk, encoding?, cb?) => {
        sendRawLine(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'), stream);
        return orig(chunk, encoding as BufferEncoding, cb);
      };
    process.stdout.write = makeCapture(origStdoutWrite, 'stdout') as typeof process.stdout.write;
    process.stderr.write = makeCapture(origStderrWrite, 'stderr') as typeof process.stderr.write;

    let result!: Awaited<ReturnType<typeof runInProcess>>;
    try {
      result = await runInProcess({
        descriptor: request.descriptor,
        platform,
        ui,
        eventEmitter,
        handlerPath,
        cwd,
        input: request.input,
      });
    } finally {
      process.stdout.write = origStdoutWrite;
      process.stderr.write = origStderrWrite;
    }

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
    case 'uiPromptResult': {
      const result = message as UIPromptResultMessage;
      const resolve = pendingPrompts.get(result.promptId);
      if (resolve) {
        pendingPrompts.delete(result.promptId);
        resolve(result.value);
      }
      break;
    }
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
