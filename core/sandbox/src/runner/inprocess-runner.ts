/**
 * @module @kb-labs/core-sandbox/runner/inprocess-runner
 * In-process runner for dev mode (no isolation)
 */

import * as path from 'node:path';
import type { SandboxRunner } from './sandbox-runner';
import type {
  HandlerRef,
  ExecutionContext,
  ExecutionResult,
} from '../types/index';
import { collectMetrics } from '../monitoring/metrics-collector';
import { normalizeError } from '../errors/handler-error';
import type { CliHandlerContext, RestHandlerContext } from '../types/adapter-context';
import { createDebugLogger, createLoggerOptionsFromContext } from '../debug/logger';

/**
 * Create in-process runner (dev mode - no sandbox)
 * WARNING: No isolation! Use only for development.
 * @returns SandboxRunner instance
 */
export function createInProcessRunner(): SandboxRunner {
  return {
    async run<TInput, TOutput>(
      handler: HandlerRef,
      input: TInput,
      ctx: ExecutionContext
    ): Promise<ExecutionResult<TOutput>> {
      const startedAt = Date.now();
      const cpuStart = process.cpuUsage();
      const memStart = process.memoryUsage().rss;

      // Create log buffer for dev mode
      const devLogs: string[] = [];

      // Intercept console methods to forward logs via onLog callback
      const originalConsole = {
        log: console.log.bind(console),
        warn: console.warn.bind(console),
        error: console.error.bind(console),
        debug: console.debug.bind(console),
      };

      const captureLog = (level: 'info' | 'warn' | 'error' | 'debug', ...args: unknown[]) => {
        const message = args.map(a => String(a)).join(' ');
        devLogs.push(message);
        // Stream to callback if available (real-time output)
        if (ctx.onLog) {
          ctx.onLog(message, level);
        }
      };

      // Override console methods
      console.log = (...args: unknown[]) => {
        captureLog('info', ...args);
        originalConsole.log(...args);
      };
      console.warn = (...args: unknown[]) => {
        captureLog('warn', ...args);
        originalConsole.warn(...args);
      };
      console.error = (...args: unknown[]) => {
        captureLog('error', ...args);
        originalConsole.error(...args);
      };
      console.debug = (...args: unknown[]) => {
        captureLog('debug', ...args);
        originalConsole.debug(...args);
      };

      // Create logger with unified options
      const loggerOptions = createLoggerOptionsFromContext(ctx);
      const logger = createDebugLogger(ctx.debug || false, 'sandbox:inprocess', loggerOptions);
      
      logger.group('inprocess-runner');
      
      try {
        // In dev mode, load handler directly (no sandbox)
        // Resolve handler path relative to pluginRoot (required)
        if (!ctx.pluginRoot) {
          throw new Error('pluginRoot is required in ExecutionContext');
        }
        const pluginRoot = ctx.pluginRoot;
        
        logger.debug('Starting handler execution', {
          pluginRoot,
          workdir: ctx.workdir,
          handler: `${handler.file}#${handler.export}`,
          hasAdapterContext: !!ctx.adapterContext,
          hasAdapterMeta: !!ctx.adapterMeta,
        });
        
        // Handler file path from manifest (e.g., './cli/init#run')
        // Remove leading './' if present
        const handlerFile = handler.file.replace(/^\.\//, '');
        
        // Try multiple paths:
        // 1. dist/cli/init.js (built file)
        // 2. cli/init.js (relative to pluginRoot)
        // 3. handler.file as-is
        const distPath = path.join(pluginRoot, 'dist', handlerFile + '.js');
        const relativePath = path.join(pluginRoot, handlerFile + '.js');
        const directPath = path.resolve(pluginRoot, handler.file + '.js');
        
        // Debug logging
        if (ctx.debug && ctx.onLog) {
          ctx.onLog(`[debug] Trying paths: dist=${distPath}`, 'debug');
          ctx.onLog(`[debug] Trying paths: relative=${relativePath}`, 'debug');
          ctx.onLog(`[debug] Trying paths: direct=${directPath}`, 'debug');
        }
        
        // Try to find which path exists
        const fs = await import('fs/promises');
        let finalHandlerPath: string;
        
        try {
          await fs.access(distPath);
          finalHandlerPath = distPath;
          if (ctx.debug && ctx.onLog) {
            ctx.onLog(`[debug] Using dist path: ${finalHandlerPath}`, 'debug');
          }
        } catch {
          try {
            await fs.access(relativePath);
            finalHandlerPath = relativePath;
            if (ctx.debug && ctx.onLog) {
              ctx.onLog(`[debug] Using relative path: ${finalHandlerPath}`, 'debug');
            }
          } catch {
            try {
              await fs.access(directPath);
              finalHandlerPath = directPath;
              if (ctx.debug && ctx.onLog) {
                ctx.onLog(`[debug] Using direct path: ${finalHandlerPath}`, 'debug');
              }
            } catch {
              // Fallback to dist path (will error if doesn't exist)
              finalHandlerPath = distPath;
              if (ctx.debug && ctx.onLog) {
                ctx.onLog(`[debug] Fallback to dist path: ${finalHandlerPath}`, 'debug');
              }
            }
          }
        }
        
        const handlerModule = await import(finalHandlerPath);
        const handlerFn = handlerModule[handler.export];

        if (!handlerFn || typeof handlerFn !== 'function') {
          throw new Error(
            `Handler ${handler.export} not found or not a function in ${handler.file}`
          );
        }

        // Execute handler directly
        // For CLI commands, handler expects (ctx, argv, flags) where ctx contains presenter
        // For REST handlers, handler expects (input, ctx) where ctx is ExecutionContext
        // Check adapter metadata to determine handler signature
        const adapterMeta = ctx.adapterMeta;
        const adapterContext = ctx.adapterContext;
        
        logger.debug('Executing handler', {
          hasAdapterContext: !!adapterContext,
          adapterContextType: adapterContext?.type,
          hasAdapterMeta: !!adapterMeta,
          adapterMetaSignature: adapterMeta?.signature,
        });
        
        let result: TOutput | undefined;
        
        if (adapterMeta?.signature === 'command' && adapterContext?.type === 'cli') {
          // CLI command handler signature: (ctx, argv, flags)
          const cmdCtx = adapterContext as CliHandlerContext;
          logger.debug('Using CLI handler signature', { signature: 'command' });
          result = (await handlerFn(cmdCtx, cmdCtx.argv, cmdCtx.flags)) as TOutput;
        } else if (adapterContext?.type === 'rest') {
          // REST handler signature: (input, ctx)
          const restCtx = adapterContext as RestHandlerContext;
          logger.debug('Using REST handler signature', { signature: 'request' });
          result = (await handlerFn(input, restCtx)) as TOutput;
        } else if (adapterMeta?.signature === 'cron' && adapterContext) {
          // Cron job handler signature: (input, ctx) with full PluginHandlerContext
          // Need to build runtime using buildRuntime() from plugin-runtime
          logger.debug('Using cron job handler signature', { signature: 'cron' });

          result = (await handlerFn(input, adapterContext)) as TOutput;
        } else {
          // Fallback to basic context (for backwards compatibility)
          // This should not happen with new architecture, but kept for safety
          if (!adapterContext || !adapterMeta) {
            logger.warn('Missing adapterContext or adapterMeta, using fallback', {
              hasAdapterContext: !!adapterContext,
              hasAdapterMeta: !!adapterMeta,
            });
          }
          logger.debug('Using fallback handler signature');
          result = (await handlerFn(input, {
            requestId: ctx.requestId,
            workdir: ctx.workdir,
            outdir: ctx.outdir,
            pluginId: ctx.pluginId,
            pluginVersion: ctx.pluginVersion,
            traceId: ctx.traceId,
            spanId: ctx.spanId,
            parentSpanId: ctx.parentSpanId,
            debug: ctx.debug,
          })) as TOutput;
        }
        
        logger.debug('Handler execution completed', { resultType: typeof result });
        
        logger.groupEnd();
        return {
          ok: true,
          data: result,
          metrics: collectMetrics(startedAt, cpuStart, memStart),
        };
      } catch (error) {
        const normalizedError = normalizeError(error);
        const metrics = collectMetrics(startedAt, cpuStart, memStart);
        
        logger.error('Handler execution failed', {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          code: normalizedError.code,
        });
        
        logger.groupEnd();
        
        // Always include logs on error (for debugging even without --debug)
        const executeResult: ExecutionResult<TOutput> = {
          ok: false,
          error: {
            code: normalizedError.code,
            message: normalizedError.message,
            stack: normalizedError.stack,
          },
          metrics,
          logs: devLogs, // Always include logs on error
        };
        
        return executeResult;
      } finally {
        // Restore original console methods
        console.log = originalConsole.log;
        console.warn = originalConsole.warn;
        console.error = originalConsole.error;
        console.debug = originalConsole.debug;
      }
    },

    async dispose(): Promise<void> {
      // Nothing to dispose in in-process mode
    },
  };
}

