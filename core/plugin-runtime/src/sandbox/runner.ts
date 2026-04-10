/**
 * Sandbox runner for executing plugins
 *
 * Supports two modes:
 * - In-process: For trusted plugins or development
 * - Subprocess: For sandboxed execution
 *
 * Runner layer is host-agnostic - it returns RunResult<T> with raw data.
 * Host layer (CLI, REST, etc.) wraps this into host-specific format.
 */

import { fork, type ChildProcess } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';
import type {
  PluginContextDescriptor,
  PlatformServices,
  UIFacade,
  RunResult,
  ExecutionMeta,
} from '@kb-labs/plugin-contracts';
import { PluginError, TimeoutError, AbortError, createExecutionMeta } from '@kb-labs/plugin-contracts';
import type { ParentMessage, ChildMessage, ResultMessage, ErrorMessage } from './ipc-protocol.js';
import { createPluginContextV3 } from '../context/index.js';
import { executeCleanup, type PluginInvokerFn, type EventEmitterFn } from '../api/index.js';

/**
 * Create execution metadata from descriptor and timing
 */
function buildExecutionMeta(
  descriptor: PluginContextDescriptor,
  startTime: number
): ExecutionMeta {
  return createExecutionMeta({
    pluginId: descriptor.pluginId,
    pluginVersion: descriptor.pluginVersion,
    handlerId: descriptor.handlerId,
    requestId: descriptor.requestId,
    tenantId: descriptor.tenantId,
    startTime,
  });
}

export interface RunInProcessOptions {
  descriptor: PluginContextDescriptor;
  platform: PlatformServices;
  ui: UIFacade;
  pluginInvoker?: PluginInvokerFn;
  eventEmitter?: EventEmitterFn;
  handlerPath: string;
  input: unknown;
  signal?: AbortSignal;
  cwd: string;
  outdir?: string;
}

export interface RunInSubprocessOptions {
  descriptor: PluginContextDescriptor;
  socketPath: string;
  platformAuthToken?: string;
  handlerPath: string;
  input: unknown;
  timeoutMs?: number;
  signal?: AbortSignal;
  cwd: string;
  outdir?: string;
  onLog?: (entry: { level: string; message: string; stream: 'stdout' | 'stderr'; lineNo: number; timestamp: string; meta?: Record<string, unknown> }) => void;
}

/**
 * Run plugin handler in the current process (no sandbox)
 *
 * Returns raw handler result wrapped in RunResult with execution metadata.
 * Host layer is responsible for transforming this into host-specific format.
 *
 * @returns RunResult<T> with raw data from handler and execution metadata
 */
export async function runInProcess<T = unknown>(
  options: RunInProcessOptions
): Promise<RunResult<T>> {
  const { descriptor, platform, ui, pluginInvoker, eventEmitter, handlerPath, input, signal, cwd, outdir } = options;
  const startTime = Date.now();

  // Create context
  const { context, cleanupStack } = createPluginContextV3({
    descriptor,
    platform,
    ui,
    signal,
    pluginInvoker,
    eventEmitter,
    cwd,
    outdir,
  });

  // Set __KB_CONFIG_SECTION__ for useConfig() auto-detection (in-process mode)
  if (descriptor.configSection) {
    const globalWithConfig = globalThis as typeof globalThis & { __KB_CONFIG_SECTION__?: string };
    globalWithConfig.__KB_CONFIG_SECTION__ = descriptor.configSection;
  }

  // Analytics scope injection for plugin execution
  // Save original source before overriding (for in-process mode)
  let originalSource: { product: string; version: string } | undefined;

  try {
    // Override analytics source with plugin-specific source
    // This ensures events tracked by the plugin show the correct source
    if (descriptor.pluginId && descriptor.pluginVersion && platform.analytics) {
      // Save original source for restore (in-process mode)
      originalSource = platform.analytics.getSource?.();

      // Override source to plugin source
      platform.analytics.setSource?.({
        product: descriptor.pluginId,
        version: descriptor.pluginVersion,
      });

      platform.logger?.debug?.('Analytics source overridden', {
        from: originalSource?.product,
        to: descriptor.pluginId,
      });
    }

    // Import and execute handler
    const handlerModule = await import(handlerPath);
    const handler = handlerModule.default ?? handlerModule;

    if (typeof handler.execute !== 'function') {
      throw new PluginError(
        `Handler at ${handlerPath} does not export an execute function`,
        'INVALID_HANDLER'
      );
    }

    // Execute handler and get raw result
    const data = await handler.execute(context, input) as T;

    // Return raw result with execution metadata
    return {
      ok: true,
      data,
      executionMeta: buildExecutionMeta(descriptor, startTime),
    };
  } finally {
    // Restore original analytics source (for in-process mode)
    // In subprocess mode, this is not needed (process dies after handler)
    // But for in-process mode, we must restore to avoid cross-plugin contamination
    if (originalSource && platform.analytics?.setSource) {
      platform.analytics.setSource(originalSource);
      platform.logger?.debug?.('Analytics source restored', {
        to: originalSource.product,
      });
    }

    // Execute cleanups
    await executeCleanup(cleanupStack, platform.logger);
  }
}

/**
 * Run plugin handler in a subprocess (sandboxed)
 *
 * Returns raw handler result wrapped in RunResult with execution metadata.
 * Host layer is responsible for transforming this into host-specific format.
 *
 * @returns RunResult<T> with raw data from handler and execution metadata
 */
export async function runInSubprocess<T = unknown>(
  options: RunInSubprocessOptions
): Promise<RunResult<T>> {
  const {
    descriptor,
    socketPath,
    platformAuthToken,
    handlerPath,
    input,
    timeoutMs = 30000,
    signal,
  } = options;

  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    // Path to bootstrap script
    // Strategy: try multiple locations to find bootstrap.js
    // 1. Same dir as current module (production: cli-bin/dist/bootstrap.js)
    // 2. Sandbox subdir (development: runtime-v3/dist/sandbox/bootstrap.js)
    // 3. Relative to cwd (fallback)

    const BOOTSTRAP = 'bootstrap.js';
    const currentDir = path.dirname(new URL(import.meta.url).pathname);
    const possiblePaths = [
      path.join(currentDir, BOOTSTRAP),                    // Production (same dir)
      path.join(currentDir, 'sandbox', BOOTSTRAP),         // Nested sandbox dir
      path.join(process.cwd(), 'dist', 'sandbox', BOOTSTRAP), // Test/dev mode
      path.join(process.cwd(), 'dist', BOOTSTRAP),         // Fallback
      path.join(process.cwd(), 'packages', 'plugin-runtime', 'dist', 'sandbox', BOOTSTRAP), // Monorepo test mode
    ];

    let bootstrapPath: string | undefined;
    for (const p of possiblePaths) {
      try {
        fs.accessSync(p, fs.constants.R_OK);
        bootstrapPath = p;
        break;
      } catch {
        continue;
      }
    }

    if (!bootstrapPath) {
      throw new Error(
        `[V3] Could not find bootstrap.js. Tried:\n${possiblePaths.join('\n')}`
      );
    }

    // Fork child process
    const child: ChildProcess = fork(bootstrapPath, [], {
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      env: {
        ...process.env,
        NODE_ENV: process.env.NODE_ENV,
        KB_SOCKET_PATH: socketPath,
        KB_PLATFORM_SOCKET_TOKEN: platformAuthToken,
        KB_EXECUTION_ID: descriptor.requestId,
        KB_TENANT_ID: descriptor.tenantId,
      },
    });

    let completed = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    // Handle abort signal
    const abortHandler = () => {
      if (!completed) {
        child.send({ type: 'abort' } satisfies ParentMessage);
        // Give it a moment to clean up, then kill
        setTimeout(() => {
          if (!completed) {
            child.kill('SIGKILL');
          }
        }, 1000);
      }
    };

    if (signal) {
      signal.addEventListener('abort', abortHandler);
    }

    // Pipe stdout/stderr to parent
    child.stdout?.pipe(process.stdout);
    child.stderr?.pipe(process.stderr);

    // Set timeout
    // eslint-disable-next-line prefer-const
    timeoutId = setTimeout(() => {
      if (!completed) {
        completed = true;
        child.kill('SIGKILL');
        reject(new TimeoutError(`Plugin execution timed out after ${timeoutMs}ms`));
      }
    }, timeoutMs);

    // Handle messages from child
    child.on('message', (msg: ChildMessage) => {
      if (msg.type === 'ready') {
        // Child is ready, send execute message
        const executeMsg: ParentMessage = {
          type: 'execute',
          descriptor,
          socketPath,
          handlerPath,
          input,
          cwd: options.cwd,
          outdir: options.outdir,
        };
        child.send(executeMsg);
      } else if (msg.type === 'log') {
        // Forward log entry to onLog callback
        options.onLog?.(msg.entry);
      } else if (msg.type === 'result') {
        completed = true;
        clearTimeout(timeoutId);
        signal?.removeEventListener('abort', abortHandler);

        const resultMsg = msg as ResultMessage;

        // IPC sends raw handler return value — pass through as-is.
        // Host layer (CLI, REST, Workflow) handles interpretation.
        resolve({
          ok: true,
          data: resultMsg.data as T,
          executionMeta: buildExecutionMeta(descriptor, startTime),
        });
      } else if (msg.type === 'error') {
        completed = true;
        clearTimeout(timeoutId);
        signal?.removeEventListener('abort', abortHandler);

        const errorMsg = msg as ErrorMessage;
        reject(PluginError.fromJSON(errorMsg.error));
      }
    });

    // Handle child exit
    child.on('exit', (code) => {
      if (!completed) {
        completed = true;
        clearTimeout(timeoutId);
        signal?.removeEventListener('abort', abortHandler);

        if (signal?.aborted) {
          reject(new AbortError());
        } else {
          reject(new PluginError(
            `Plugin process exited with code ${code}`,
            'PROCESS_EXIT',
            { code }
          ));
        }
      }
    });

    // Handle child error
    child.on('error', (error) => {
      if (!completed) {
        completed = true;
        clearTimeout(timeoutId);
        signal?.removeEventListener('abort', abortHandler);
        reject(error);
      }
    });
  });
}
