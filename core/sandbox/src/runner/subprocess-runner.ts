/**
 * @module @kb-labs/core-sandbox/runner/subprocess-runner
 * Fork-based subprocess runner for isolation
 */

import { fork, type ChildProcess } from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { existsSync, appendFileSync } from 'node:fs';
import type { SandboxRunner } from './sandbox-runner';
import type {
  HandlerRef,
  ExecutionContext,
  ExecutionResult,
} from '../types/index';
import { pickEnv } from '../isolation/env-filter';
import { RingBuffer } from '../monitoring/log-collector';
import { collectMetrics } from '../monitoring/metrics-collector';
import { startTimeoutWatch, clearTimeoutWatch } from '../policies/execution-policy';
import type { SandboxConfig } from '../types/index';
import { createDebugLogger, createLoggerOptionsFromContext } from '../debug/logger';
import { serializeContext } from './ipc-serializer';
import { createTimeoutSignal } from '../cancellation/abort-controller';
import {
  formatLogLine,
  shouldUseColors,
} from '../debug/progress';

/**
 * Quick estimate of object size without stringifying
 * Prevents OOM from creating large string copies
 */
function estimateObjectSize(obj: unknown): number {
  if (obj === null || obj === undefined) {
    return 4;
  }
  if (typeof obj === 'string') {
    return obj.length;
  }
  if (typeof obj === 'number' || typeof obj === 'boolean') {
    return 20;
  }
  if (Array.isArray(obj)) {
    return obj.reduce((sum, item) => sum + estimateObjectSize(item), 2);
  }
  if (typeof obj === 'object') {
    return Object.entries(obj).reduce(
      (sum, [key, val]) => sum + key.length + estimateObjectSize(val),
      2
    );
  }
  return 100;
}

/**
 * Setup log pipes for child process
 * @param child - Child process
 * @param ctx - Execution context
 * @param config - Sandbox configuration
 * @param quiet - Whether to suppress output (--quiet flag)
 * @returns Ring buffer for log collection
 */
function setupLogPipes(
  child: ChildProcess,
  ctx: ExecutionContext,
  config: SandboxConfig,
  quiet: boolean
): RingBuffer {
  // DEBUG: Log setupLogPipes called
  appendFileSync('/tmp/subprocess-runner-debug.log',
    `[SETUP-LOG-PIPES] Called, child.stdout exists: ${!!child.stdout}\n`
  );

  const bufferSizeMb = config.monitoring.logBufferSizeMb || 1;
  const ringBuffer = new RingBuffer(bufferSizeMb * 1024 * 1024);

  if (child.stdout) {
    appendFileSync('/tmp/subprocess-runner-debug.log',
      `[SETUP-LOG-PIPES] Attaching stdout listener\n`
    );
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (dataRaw: string) => {
      // CRITICAL OOM FIX: Limit data size BEFORE split() to prevent OOM on huge logs
      // Even 1MB chunks can cause OOM when split() creates tens of thousands of lines
      const MAX_LOG_CHUNK_SIZE = 100000; // 100KB limit per chunk (safe for split)
      let data = dataRaw;
      if (data.length > MAX_LOG_CHUNK_SIZE) {
        const truncated = data.slice(0, MAX_LOG_CHUNK_SIZE);
        const warning = `\n[WARNING: Log output truncated - ${data.length} bytes > ${MAX_LOG_CHUNK_SIZE} bytes]`;
        data = truncated + warning;
        console.error(`⚠️  PARENT: Child stdout exceeded ${MAX_LOG_CHUNK_SIZE} bytes, truncating to prevent OOM`);
      }

      const lines = data.split('\n').filter((line) => line.trim());
      for (const line of lines) {
        // Always collect in buffer for error display
        ringBuffer.append(line);
        
        // Format line with colors if enabled
        const formattedLine = shouldUseColors() && !quiet
          ? formatLogLine('info', line, ctx.pluginId)
          : line;
        
        // Show output only if NOT quiet
        if (!quiet) {
          process.stdout.write(formattedLine + '\n');
        }
        
        // Send through onLog callback if available (for debug mode formatting)
        if (ctx.onLog) {
          ctx.onLog(line, 'info');
        }
      }
    });
    child.stdout.on('end', () => {
      if (ctx.debug && ctx.onLog) {
        ctx.onLog('[SUBPROCESS] stdout closed', 'debug');
      }
    });
  }

  if (child.stderr) {
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (dataRaw: string) => {
      // CRITICAL OOM FIX: Limit data size BEFORE split() to prevent OOM on huge logs
      // Even 1MB chunks can cause OOM when split() creates tens of thousands of lines
      const MAX_LOG_CHUNK_SIZE = 100000; // 100KB limit per chunk (safe for split)
      let data = dataRaw;
      if (data.length > MAX_LOG_CHUNK_SIZE) {
        const truncated = data.slice(0, MAX_LOG_CHUNK_SIZE);
        const warning = `\n[WARNING: Log output truncated - ${data.length} bytes > ${MAX_LOG_CHUNK_SIZE} bytes]`;
        data = truncated + warning;
        console.error(`⚠️  PARENT: Child stderr exceeded ${MAX_LOG_CHUNK_SIZE} bytes, truncating to prevent OOM`);
      }

      const lines = data.split('\n').filter((line) => line.trim());
      for (const line of lines) {
        // Always collect in buffer for error display
        ringBuffer.append(line);
        
        // Try to detect log level from line content
        let level: 'info' | 'warn' | 'error' | 'debug' = 'error';
        const lowerLine = line.toLowerCase();
        if (lowerLine.includes('error') || lowerLine.includes('✗') || lowerLine.includes('failed')) {
          level = 'error';
        } else if (lowerLine.includes('warn') || lowerLine.includes('⚠')) {
          level = 'warn';
        } else if (lowerLine.includes('debug')) {
          level = 'debug';
        } else {
          level = 'info';
        }
        
        // Format line with colors if enabled
        const formattedLine = shouldUseColors()
          ? formatLogLine(level, line, ctx.pluginId)
          : line;
        
        // stderr always shown (even with quiet, errors should be visible)
        process.stderr.write(formattedLine + '\n');
        
        // Send through onLog callback if available
        if (ctx.onLog) {
          ctx.onLog(line, level);
        }
      }
    });
    child.stderr.on('end', () => {
      if (ctx.debug && ctx.onLog) {
        ctx.onLog('[SUBPROCESS] stderr closed', 'debug');
      }
    });
  }

  // Handle IPC LOG messages (this handler is set up early, before other message handlers)
  // Note: Other message handlers (OK, ERR, READY) are set up in the run() method
  child.on('message', (msg: any) => {
    if (msg?.type === 'LOG' && msg.payload) {
      const { level, message, meta } = msg.payload;
      // Optimize: Only stringify meta if it's small to prevent memory issues
      let metaStr = '';
      if (meta) {
        try {
          // Quick size check before stringifying
          const metaSize = estimateObjectSize(meta);
          if (metaSize < 10 * 1024) { // Only stringify if < 10KB
            metaStr = ` ${JSON.stringify(meta)}`;
          } else {
            metaStr = ` [meta: ${metaSize} bytes, truncated]`;
          }
        } catch {
          metaStr = ' [meta: non-serializable]';
        }
      }
      const logLine = `${message}${metaStr}`;
      const logLevel = (level || 'info') as 'info' | 'warn' | 'error' | 'debug';
      
      // Always collect in buffer
      ringBuffer.append(logLine);
      
      // Show only if NOT quiet, or if it's an error/warning
      if (!quiet || logLevel === 'error' || logLevel === 'warn') {
        if (ctx.onLog) {
          ctx.onLog(logLine, logLevel);
        }
      }
    }
  });

  return ringBuffer;
}

/**
 * Find workspace root by looking for kb-labs-core directory (most reliable)
 * Falls back to pnpm-workspace.yaml if kb-labs-core not found
 */
function findWorkspaceRoot(startDir: string): string | null {
  let currentDir = path.resolve(startDir);
  for (let i = 0; i < 20; i++) {
    // Check for kb-labs-core directory first (most reliable indicator of monorepo root)
    if (existsSync(path.join(currentDir, 'kb-labs-core'))) {
      return currentDir;
    }
    // Check for pnpm-workspace.yaml (monorepo root)
    if (existsSync(path.join(currentDir, 'pnpm-workspace.yaml'))) {
      // Verify that kb-labs-core exists at this level (to avoid false positives)
      if (existsSync(path.join(currentDir, 'kb-labs-core'))) {
        return currentDir;
      }
    }
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {break;}
    currentDir = parentDir;
  }
  return null;
}

/**
 * Get bootstrap file path using simple path resolution
 * Checks known paths in order of preference
 */
function getBootstrapPath(): string {
  // Support both ESM and CJS (CJS when bundled by tsup)
  let currentFilename: string;
  let currentDirname: string;

  try {
    // Try ESM first
    currentFilename = fileURLToPath(import.meta.url);
    currentDirname = path.dirname(currentFilename);
  } catch {
    // Fall back to CJS globals (when bundled by tsup into bin.cjs)
    // In CJS, __dirname and __filename are global variables injected by Node.js
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore - __dirname exists in CJS but not in ESM types
    currentDirname = typeof __dirname !== 'undefined' ? __dirname : process.cwd();
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore - __filename exists in CJS but not in ESM types
    currentFilename = typeof __filename !== 'undefined' ? __filename : '';
  }

  const cwd = process.cwd();

  // Find workspace root - try both cwd and currentDirname
  const workspaceRootFromCwd = findWorkspaceRoot(cwd);
  const workspaceRootFromDirname = findWorkspaceRoot(currentDirname);
  const workspaceRoot = workspaceRootFromCwd || workspaceRootFromDirname;

  // Debug info - use compact JSON to prevent memory issues
  if (process.env.KB_PLUGIN_DEV_MODE === 'true') {
    const debugInfo = {
      currentFilename,
      currentDirname,
      cwd,
      workspaceRootFromCwd,
      workspaceRootFromDirname,
      workspaceRoot,
    };
    process.stderr.write(`[getBootstrapPath] DEBUG: ${JSON.stringify(debugInfo)}\n`);
  }
  
  // 1. Try workspace root (most reliable for monorepo)
  if (workspaceRoot) {
    const workspacePath = path.join(workspaceRoot, 'kb-labs-core', 'packages', 'core-sandbox', 'dist', 'runner', 'bootstrap.js');
    const exists = existsSync(workspacePath);
    if (process.env.KB_PLUGIN_DEV_MODE === 'true') {
      process.stderr.write(`[getBootstrapPath] Checking workspace path: ${workspacePath}, exists: ${exists}\n`);
    }
    if (exists) {
      if (process.env.KB_PLUGIN_DEV_MODE === 'true') {
        process.stderr.write(`[getBootstrapPath] SUCCESS: Found bootstrap at workspace root: ${workspacePath}\n`);
      }
      return workspacePath;
    }
  }
  
  // 2. Try relative to current file (if we're in sandbox/dist/runner, bootstrap is in same dir)
  const relativePath = path.join(currentDirname, 'bootstrap.js');
  const relativeExists = existsSync(relativePath);
  if (process.env.KB_PLUGIN_DEV_MODE === 'true') {
    process.stderr.write(`[getBootstrapPath] Checking relative path: ${relativePath}, exists: ${relativeExists}\n`);
  }
  if (relativeExists) {
    if (process.env.KB_PLUGIN_DEV_MODE === 'true') {
      process.stderr.write(`[getBootstrapPath] SUCCESS: Found bootstrap at relative path: ${relativePath}\n`);
    }
    return relativePath;
  }
  
  // 3. Try node_modules (for production builds)
  // Traverse up from current file to find node_modules
  let currentDir = currentDirname;
  for (let i = 0; i < 10; i++) {
    const nodeModulesPath = path.join(currentDir, 'node_modules', '@kb-labs', 'sandbox', 'dist', 'runner', 'bootstrap.js');
    const nodeModulesExists = existsSync(nodeModulesPath);
    if (process.env.KB_PLUGIN_DEV_MODE === 'true') {
      process.stderr.write(`[getBootstrapPath] Checking node_modules path: ${nodeModulesPath}, exists: ${nodeModulesExists}\n`);
    }
    if (nodeModulesExists) {
      if (process.env.KB_PLUGIN_DEV_MODE === 'true') {
        process.stderr.write(`[getBootstrapPath] SUCCESS: Found bootstrap at node_modules: ${nodeModulesPath}\n`);
      }
      return nodeModulesPath;
    }
    
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {break;}
    currentDir = parentDir;
  }
  
  // If nothing found, throw clear error with all attempted paths
  const attemptedPaths: string[] = [];
  if (workspaceRoot) {
    attemptedPaths.push(path.join(workspaceRoot, 'kb-labs-core', 'packages', 'core-sandbox', 'dist', 'runner', 'bootstrap.js'));
  }
  attemptedPaths.push(relativePath);
  attemptedPaths.push('node_modules/@kb-labs/core-sandbox/dist/runner/bootstrap.js');
  
  throw new Error(
    `Bootstrap file not found. Tried:\n` +
    attemptedPaths.map(p => `  - ${p}`).join('\n') +
    `\ncurrentDirname: ${currentDirname}\n` +
    `cwd: ${cwd}\n` +
    `workspaceRoot: ${workspaceRoot || 'null'}\n` +
    `Make sure @kb-labs/core-sandbox is built: run 'pnpm build' in kb-labs-core/packages/core-sandbox`
  );
}

/**
 * Find available debug port (starting from 9229)
 */
async function findAvailablePort(startPort: number = 9229): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(startPort, () => {
      const port = (server.address() as any)?.port;
      server.close(() => {
        resolve(port || startPort);
      });
    });
    server.on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        // Try next port
        findAvailablePort(startPort + 1).then(resolve).catch(reject);
      } else {
        reject(err);
      }
    });
  });
}

/**
 * Create subprocess runner with fork-based isolation
 * @param config - Sandbox configuration
 * @returns SandboxRunner instance
 */
export function createSubprocessRunner(config: SandboxConfig): SandboxRunner {
  // Resolve bootstrap path once when creating the runner
  let bootstrapPath: string;
  try {
    bootstrapPath = getBootstrapPath();
  } catch (error) {
    // If bootstrap path cannot be resolved, throw clear error
    throw new Error(
      `Failed to resolve bootstrap path when creating subprocess runner: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  
  return {
    async run<TInput, TOutput>(
      handler: HandlerRef,
      input: TInput,
      ctx: ExecutionContext
    ): Promise<ExecutionResult<TOutput>> {
      // Create logger with unified options
      const loggerOptions = createLoggerOptionsFromContext(ctx);
      const logger = createDebugLogger(ctx.debug || false, 'sandbox:subprocess', loggerOptions);
      
      logger.group('subprocess-runner');
      logger.debug('Subprocess runner started', {
        handler: `${handler.file}#${handler.export}`,
        pluginRoot: ctx.pluginRoot,
        workdir: ctx.workdir,
      });
      
      const startedAt = Date.now();
      const cpuStart = process.cpuUsage();
      const memStart = process.memoryUsage().rss;

      // Get memory limit
      const memoryMb = config.execution.memoryMb;

      // Prepare environment (whitelisted only)
      const env = pickEnv(process.env as Record<string, string | undefined>, config.permissions.env.allow);
      env.START_TIME = String(startedAt);

      // Check if inspect mode is enabled
      // debugLevel is now properly typed in ExecutionContext
      const debugLevel = ctx.debugLevel || (ctx.debug ? 'verbose' : undefined);
      const isInspectMode = debugLevel === 'inspect';
      let inspectPort: number | undefined;
      let inspectUrl: string | undefined;

      // Prepare execArgv
      const execArgv: string[] = [
        `--max-old-space-size=${memoryMb}`,
        '--no-deprecation',
        // TEMPORARILY DISABLED: --enable-source-maps may cause OOM during module loading
        // '--enable-source-maps',
      ];

      // Add inspect flag if debug mode is inspect
      if (isInspectMode) {
        try {
          inspectPort = await findAvailablePort(9229);
          execArgv.push(`--inspect-brk=${inspectPort}`);
          inspectUrl = `ws://127.0.0.1:${inspectPort}/`;
          
          // Log debugger info
          if (ctx.onLog) {
            ctx.onLog(`[debug] Inspect mode enabled, debugLevel: ${debugLevel}`, 'debug');
            ctx.onLog(`🔍 Debugger listening on ${inspectUrl}`, 'info');
            ctx.onLog('🔗 Open chrome://inspect or connect VSCode debugger', 'info');
            ctx.onLog('⏸ Paused at first line, attach debugger to continue', 'info');
          }
        } catch (error) {
          // Fallback to default port if finding port fails
          execArgv.push('--inspect-brk=9229');
          inspectUrl = 'ws://127.0.0.1:9229/';
          if (ctx.onLog) {
            ctx.onLog(`⚠️  Using default debug port 9229 (error finding port: ${error})`, 'warn');
          }
        }
      }

      // Verify bootstrap file exists before forking
      if (!existsSync(bootstrapPath)) {
        const error = new Error(`Bootstrap file not found: ${bootstrapPath}`);
        logger.error('Bootstrap file missing', { path: bootstrapPath });
        if (ctx.onLog) {
          ctx.onLog(`[sandbox] Bootstrap file not found: ${bootstrapPath}`, 'error');
        }
        throw error;
      }
      
      logger.debug('Forking bootstrap process', {
        path: bootstrapPath,
        workdir: ctx.workdir,
        execArgv: execArgv.join(' '),
      });
      
      if (ctx.onLog) {
        ctx.onLog(`[SUBPROCESS] Forking bootstrap from: ${bootstrapPath}`, 'debug');
        ctx.onLog(`[SUBPROCESS] Workdir: ${ctx.workdir}`, 'debug');
      }
      
      // DEBUG: Log before fork
      appendFileSync('/tmp/subprocess-runner-debug.log',
        `[SUBPROCESS-RUNNER] About to fork child process\n`
      );

      const child = fork(bootstrapPath, [], {
        execArgv,
        env,
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
        cwd: ctx.workdir,
      });

      appendFileSync('/tmp/subprocess-runner-debug.log',
        `[SUBPROCESS-RUNNER] Child forked, PID: ${child.pid}\n`
      );

      // DIAGNOSTIC: Test if stderr works at all (only in debug mode)
      const DEBUG_MODE = process.env.DEBUG_SANDBOX === '1' || process.env.NODE_ENV === 'development';
      if (DEBUG_MODE) {
        process.stderr.write(`\n[DIAGNOSTIC] Child forked, PID: ${child.pid}\n`);
      }

      logger.debug('Child process forked', { pid: child.pid });

      if (ctx.onLog) {
        ctx.onLog(`[SUBPROCESS] Child process forked, PID: ${child.pid}`, 'debug');
      }

      // Extract quiet flag from context (if available)
      const quiet = !!(ctx.adapterContext as any)?.flags?.quiet;

      // Debug logging removed to prevent memory issues
      // Setup log collection (BEFORE waiting for READY, so we can capture early logs)
      const logBuffer = setupLogPipes(child, ctx, config, quiet);
      // Debug logging removed to prevent memory issues

      // ═══════════════════════════════════════════════════════════════════════════
      // PARENT PROCESS MEMORY MONITORING
      // ═══════════════════════════════════════════════════════════════════════════
      // Monitor parent process memory to detect issues BEFORE subprocess crashes
      if (DEBUG_MODE) {
        process.stderr.write('[DIAGNOSTIC] Starting parent memory monitor\n');
      }
      const parentMemoryMonitor = setInterval(() => {
        if (!DEBUG_MODE) {return;} // Skip monitoring if not in debug mode

        const mem = process.memoryUsage();
        const heapUsedMB = (mem.heapUsed / 1024 / 1024).toFixed(0);
        const heapTotalMB = (mem.heapTotal / 1024 / 1024).toFixed(0);
        const rssMB = (mem.rss / 1024 / 1024).toFixed(0);
        const externalMB = (mem.external / 1024 / 1024).toFixed(0);

        process.stderr.write(`[PARENT-MEMORY] Heap: ${heapUsedMB}/${heapTotalMB}MB, RSS: ${rssMB}MB, External: ${externalMB}MB\n`);

        // Warning if parent process using too much memory
        if (mem.heapUsed > 512 * 1024 * 1024) { // >512MB
          process.stderr.write(`[PARENT-MEMORY] ⚠️  Parent process heap usage HIGH: ${heapUsedMB}MB\n`);
        }
      }, 2000); // Every 2 seconds

      // ═══════════════════════════════════════════════════════════════════════════

      // Log when child process exits
      child.on('exit', (code, signal) => {
        clearInterval(parentMemoryMonitor); // Stop monitoring

        logger.debug('Child process exited', { code, signal });
        if (ctx.onLog) {
          ctx.onLog(`[SUBPROCESS] Child process exited with code ${code}, signal ${signal}`, 'debug');
        }
      });

      // Start timeout watch
      const timeoutMs = config.execution.timeoutMs;
      const graceMs = config.execution.graceMs;
      const timeoutHandle = startTimeoutWatch(child, timeoutMs, graceMs);

      // Create AbortSignal for cancellation
      const controller = new AbortController();
      const timeoutSignal = createTimeoutSignal(timeoutMs);
      
      // Relay abort to subprocess
      timeoutSignal.addEventListener('abort', () => {
        controller.abort();
        if (!child.killed) {
          child.kill('SIGTERM');
        }
      });
      
      // Combine signals (timeout + user cancellation)
      const combinedSignal = controller.signal;
      if (ctx.signal) {
        ctx.signal.addEventListener('abort', () => {
          controller.abort();
        });
      }
      
      const ctxWithSignal = { ...ctx, signal: combinedSignal };

      // Wait for READY message before sending RUN
      // IMPORTANT: setupLogPipes already sets up a message handler for LOG messages
      // We need to ensure our readyHandler can still receive READY messages
      await new Promise<void>((resolve, reject) => {
        // Check if child already exited (shouldn't happen, but be defensive)
        if (child.killed || child.exitCode !== null) {
          reject(new Error(`Subprocess exited before sending READY (exitCode: ${child.exitCode})`));
          return;
        }
        
        let resolved = false;
        const cleanup = () => {
          if (resolved) {return;}
          resolved = true;
          clearTimeout(timeout);
          child.off('message', readyHandler);
          child.off('exit', exitHandler);
        };
        
        const timeout = setTimeout(() => {
          logger.error('READY message not received within 5 seconds', {
            pid: child.pid,
            killed: child.killed,
            exitCode: child.exitCode,
            signalCode: child.signalCode,
          });
          cleanup();
          // Kill the child process if it's still running but not responding
          if (!child.killed && child.exitCode === null) {
            child.kill('SIGTERM');
          }
          reject(new Error('Subprocess did not send READY message within 5 seconds'));
        }, 5000);
        
        const readyHandler = (msg: unknown) => {
          if (resolved) {return;}
          const message = msg as { type?: string; payload?: unknown };
          logger.debug('Received message while waiting for READY', { type: message?.type });
          if (message?.type === 'READY') {
            logger.debug('READY message received, proceeding with RUN');
            cleanup();
            resolve();
          } else if (message?.type === 'LOG') {
            // LOG messages are handled by setupLogPipes, but log here too for debugging
            logger.debug('Received LOG while waiting for READY', { 
              message: (message.payload as { message?: string })?.message 
            });
            // Don't remove handler - continue waiting for READY
          } else if (message?.type === 'ERR') {
            // If subprocess sends ERR before READY, something went wrong
            logger.error('Subprocess sent ERR before READY', { 
              payload: message.payload 
            });
            cleanup();
            reject(new Error(`Subprocess error before READY: ${JSON.stringify(message.payload)}`));
          }
        };
        
        // Handle child exit before READY
        const exitHandler = (code: number | null, signal: NodeJS.Signals | null) => {
          if (resolved) {return;}
          cleanup();
          reject(new Error(`Subprocess exited before READY (code: ${code}, signal: ${signal})`));
        };
        child.once('exit', exitHandler);
        
        // Add handler - it will be called BEFORE setupLogPipes handler (if both handle same message)
        // But we need to ensure both can coexist - setupLogPipes handles LOG, we handle READY
        child.on('message', readyHandler);
      });

      // Send execution request (serialize context for IPC)
      let serializedCtx;
      try {
        serializedCtx = serializeContext(ctxWithSignal);
      } catch (err) {
        logger.error('Context serialization failed', { error: err });
        throw err;
      }

      child.send({
        type: 'RUN',
        payload: {
          handlerRef: handler,
          input,
          ctx: serializedCtx,
        },
      });

      // Wait for result with timeout protection
      return new Promise<ExecutionResult<TOutput>>((resolve, reject) => {
        let resolved = false;
        const cleanup = () => {
          if (resolved) {return;}
          resolved = true;
          clearTimeoutWatch(timeoutHandle);
          if (!child.killed) {
            child.kill();
          }
        };

        // Timeout for waiting for response (should be less than execution timeout)
        const responseTimeout = setTimeout(() => {
          if (resolved) {return;}
          logger.error('Subprocess did not respond within timeout', {
            pid: child.pid,
            timeoutMs: config.execution.timeoutMs,
          });
          cleanup();
          reject(new Error(`Subprocess did not respond within ${config.execution.timeoutMs}ms`));
        }, config.execution.timeoutMs + 10000); // Add 10s buffer

        // Handle all message types (LOG, OK, ERR, READY)
        const messageHandler = (msg: unknown) => {
          if (resolved) {return;}
          const message = msg as { type?: string; payload?: unknown };
          logger.debug('Received message in result handler', { type: message?.type });
          
          // LOG messages are handled by setupLogPipes
          if (message?.type === 'LOG') {
            return; // Already handled
          }
          
          if (message?.type === 'OK' && message.payload) {
            const payload = message.payload as { data?: unknown };
            logger.debug('Received OK message, resolving with success');
            clearTimeout(responseTimeout);
            cleanup();
            child.off('message', messageHandler);
            const metrics = collectMetrics(startedAt, cpuStart, memStart);
        
            const result: ExecutionResult<TOutput> = {
              ok: true,
              data: payload.data as TOutput,
              metrics,
            };
        
            // Include logs if collection is enabled (always for error display)
            if (config.monitoring.collectLogs) {
              result.logs = logBuffer.getLines();
              logger.debug('Collected log lines', { count: result.logs?.length || 0 });
            }
        
            logger.groupEnd();
            resolve(result);
          } else if (message?.type === 'ERR' && message.payload) {
            const payload = message.payload as { code?: string; message?: string; stack?: string };
            logger.error('Received ERR message', {
              code: payload.code,
              message: payload.message,
            });
            clearTimeout(responseTimeout);
            cleanup();
            child.off('message', messageHandler);
            const metrics = collectMetrics(startedAt, cpuStart, memStart);
        
            const result: ExecutionResult<TOutput> = {
              ok: false,
              error: {
                code: payload.code || 'HANDLER_ERROR',
                message: payload.message || 'Handler execution failed',
                stack: payload.stack,
              },
              metrics,
            };
        
            // Include logs if collection is enabled (always for error display)
            if (config.monitoring.collectLogs) {
              result.logs = logBuffer.getLines();
              logger.debug('Collected log lines on error', { count: result.logs?.length || 0 });
            }
        
            logger.groupEnd();
            resolve(result);
          }
        };
        
        child.on('message', messageHandler);

        // Handle process exit without response
        const exitHandler = (code: number | null, signal: NodeJS.Signals | null) => {
          if (resolved) {return;}
          logger.error('Subprocess exited without sending response', {
            pid: child.pid,
            code,
            signal,
          });
          clearTimeout(responseTimeout);
          cleanup();
          reject(new Error(`Subprocess exited without response (code: ${code}, signal: ${signal})`));
        };
        child.once('exit', exitHandler);

        child.on('error', (error: Error) => {
          if (resolved) {return;}
          clearTimeout(responseTimeout);
          cleanup();
          const metrics = collectMetrics(startedAt, cpuStart, memStart);

          const result: ExecutionResult<TOutput> = {
            ok: false,
            error: {
              code: 'PROCESS_ERROR',
              message: error.message,
              stack: error.stack,
            },
            metrics,
          };

          // Include logs in debug mode
          if (ctx.debug && config.monitoring.collectLogs) {
            result.logs = logBuffer.getLines();
          }

          logger.groupEnd();
          resolve(result);
        });

        child.on('exit', (code: number | null, signal: string | null) => {
          if (code !== 0 || signal) {
            cleanup();
            const metrics = collectMetrics(startedAt, cpuStart, memStart);

            const isTimeout = signal === 'SIGTERM' || signal === 'SIGKILL';
            const result: ExecutionResult<TOutput> = {
              ok: false,
              error: {
                code: isTimeout ? 'TIMEOUT' : 'PROCESS_EXIT',
                message: isTimeout
                  ? `Process killed by timeout (${timeoutMs}ms)`
                  : `Process exited with code ${code} (signal: ${signal})`,
              },
              metrics,
            };

            // Include logs if collection is enabled (always for error display)
            if (config.monitoring.collectLogs) {
              result.logs = logBuffer.getLines();
              // Log if we have logs or not
              if (ctx.debug && ctx.onLog) {
                ctx.onLog(`[SUBPROCESS] Process exited with code ${code}, collected ${result.logs?.length || 0} log lines`, 'debug');
              }
            }

            logger.groupEnd();
            resolve(result);
          }
        });
      });
    },

    async dispose(): Promise<void> {
      // Nothing to dispose for now
      // In future: cleanup any shared resources
    },
  };
}

