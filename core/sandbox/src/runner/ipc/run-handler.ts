/**
 * @module @kb-labs/core-sandbox/runner/ipc/run-handler
 * Handle RUN messages from parent process
 */

import type { HandlerRef, ExecutionContext } from '../../types/index';
import type { SerializableContext } from '../ipc-serializer';
import type { Output } from '@kb-labs/core-sys/output';
import type { EventCollector, TraceRecorder, ExecutionContext as ObservabilityExecutionContext } from '../../observability/index';
import { createLogEvent, createMemoryEvent } from '../../observability/index';
import { SANDBOX_ERROR_CODES } from '../../errors/error-codes';
import type { HandlerResult } from '../execution/handler-executor';
import type { RunMessagePayload } from './message-types';

export interface RunHandlerOptions {
  payload: RunMessagePayload;
  sandboxOutput: Output;
  collector: EventCollector;
  traceRecorder: TraceRecorder | undefined;
  executionContext: ObservabilityExecutionContext;
  recreateContext: (serializedCtx: SerializableContext) => Promise<ExecutionContext>;
  executeHandler: (handlerRef: HandlerRef, input: unknown, ctx: ExecutionContext) => Promise<HandlerResult>;
}

/**
 * Handle RUN message from parent process
 *
 * This is the main entry point for executing handlers in the subprocess.
 * It:
 * 1. Starts trace recording
 * 2. Logs execution start with memory snapshot
 * 3. Starts periodic memory monitoring
 * 4. Recreates execution context from serialized IPC data
 * 5. Executes handler
 * 6. Sends result to parent via IPC
 * 7. Handles errors gracefully
 */
export async function handleRunMessage(options: RunHandlerOptions): Promise<void> {
  const {
    payload,
    sandboxOutput,
    collector,
    traceRecorder,
    executionContext,
    recreateContext,
    executeHandler,
  } = options;

  const { handlerRef, input, ctx: rawCtx, perms, manifest } = payload;

  // Inject manifest and perms into ctx.extensions for buildRuntime() in context-recreator
  if (manifest || perms) {
    const ctxWithExtensions = rawCtx as any;
    ctxWithExtensions.extensionsData = {
      ...(ctxWithExtensions.extensionsData || {}),
      manifest,
      perms,
    };
  }

  // Start trace recording for this handler
  if (traceRecorder) {
    traceRecorder.begin('handler-execution', 'execution', {
      handler: `${handlerRef.file}#${handlerRef.export}`,
    });
  }

  // Log RUN start with memory snapshot
  const startMem = process.memoryUsage();
  collector.emit(createLogEvent(
    executionContext,
    {
      level: 'info',
      message: 'Handler execution starting',
      metadata: {
        handler: `${handlerRef.file}#${handlerRef.export}`,
        memoryMB: (startMem.heapUsed / 1024 / 1024).toFixed(0),
      },
    },
    { tags: ['handler', 'start'] }
  ));

  // Start periodic memory monitoring (every 2 seconds)
  const memoryMonitor = setInterval(() => {
    const mem = process.memoryUsage();
    collector.emit(createMemoryEvent(
      executionContext,
      {
        snapshot: {
          heapUsed: mem.heapUsed,
          heapTotal: mem.heapTotal,
          rss: mem.rss,
          external: mem.external,
          arrayBuffers: mem.arrayBuffers,
        },
      },
      {
        tags: ['memory', 'periodic'],
        aiHints: {
          severity: mem.heapUsed > 2 * 1024 * 1024 * 1024 ? 7 : 3, // High if >2GB
        },
      }
    ));
  }, 2000);

  // Wrap everything in try-catch to ensure we ALWAYS send a response
  try {
    // Recreate context from serialized version if needed
    let ctx: ExecutionContext;
    try {
      ctx = 'adapterContext' in rawCtx
        ? rawCtx as ExecutionContext
        : await recreateContext(rawCtx as SerializableContext);
    } catch (contextError) {
      const err = contextError instanceof Error ? contextError : new Error(String(contextError));
      sandboxOutput.error(`Failed to recreate context: ${err.message}`, {
        code: SANDBOX_ERROR_CODES.CONTEXT_RECREATE_FAILED,
      });
      if (process.send) {
        process.send({
          type: 'ERR',
          payload: {
            code: 'CONTEXT_ERROR',
            message: `Failed to recreate context: ${err.message}`,
            stack: err.stack,
          },
        });
      }
      return;
    }

    // Execute handler with timeout protection
    let result: HandlerResult;
    try {
      result = await executeHandler(handlerRef, input, ctx);
    } catch (execError) {
      const err = execError instanceof Error ? execError : new Error(String(execError));
      sandboxOutput.error(`Handler execution failed: ${err.message}`, {
        code: SANDBOX_ERROR_CODES.HANDLER_EXECUTION_FAILED,
      });
      result = {
        ok: false,
        error: {
          code: 'HANDLER_EXECUTION_ERROR',
          message: err.message,
          stack: err.stack,
        },
      };
    }

    // Send result to parent
    if (!process.send) {
      sandboxOutput.error('process.send is not available, cannot send result', {
        code: SANDBOX_ERROR_CODES.IPC_UNAVAILABLE,
      });
      return;
    }

    try {
      if (result.ok) {
        process.send({
          type: 'OK',
          payload: {
            data: result.data,
          },
        });
      } else {
        sandboxOutput.debug(`Sending ERR message to parent: ${result.error.code} - ${result.error.message}`);
        process.send({
          type: 'ERR',
          payload: {
            code: result.error.code,
            message: result.error.message,
            stack: result.error.stack,
          },
        });
      }
    } catch (sendError) {
      // If sending fails, log but don't throw (process will exit anyway)
      sandboxOutput.error(`Failed to send result to parent: ${sendError instanceof Error ? sendError.message : String(sendError)}`, {
        code: SANDBOX_ERROR_CODES.IPC_SEND_FAILED,
      });
    }
  } catch (error) {
    // Final safety net - catch ANY unhandled error
    sandboxOutput.error(`Unhandled exception in handleRunMessage: ${error instanceof Error ? error.message : String(error)}`, {
      code: SANDBOX_ERROR_CODES.UNHANDLED_EXCEPTION,
    });
    if (error instanceof Error && error.stack) {
      sandboxOutput.debug(`Stack: ${error.stack}`);
    }

    // Try to send error to parent
    if (process.send) {
      try {
        const errorObj = error instanceof Error ? error : new Error(String(error));
        process.send({
          type: 'ERR',
          payload: {
            code: (errorObj as any).code || SANDBOX_ERROR_CODES.UNHANDLED_EXCEPTION,
            message: errorObj.message,
            stack: errorObj.stack,
          },
        });
      } catch (sendError) {
        // If even sending error fails, log and exit
        sandboxOutput.error(`Failed to send error to parent: ${sendError instanceof Error ? sendError.message : String(sendError)}`, {
          code: SANDBOX_ERROR_CODES.IPC_SEND_FAILED,
        });
        clearInterval(memoryMonitor);
        process.exit(1);
      }
    } else {
      clearInterval(memoryMonitor);
      process.exit(1);
    }
  } finally {
    // Always cleanup monitor
    clearInterval(memoryMonitor);

    // End trace recording
    if (traceRecorder) {
      traceRecorder.end('handler-execution');
    }
  }
}
