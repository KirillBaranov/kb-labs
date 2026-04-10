/**
 * @module @kb-labs/core-sandbox/runner/error-handling/unhandled-rejection
 * Handle unhandled promise rejections with crash reporting
 */

import type { Output } from '@kb-labs/core-sys/output';
import type {
  EventCollector,
  TraceRecorder,
  HeapProfiler,
  PreOOMDetector,
  HeapAnalyzer,
  CrashReporter,
  FileLogger,
  ExecutionContext,
} from '../../observability/index';
import { createErrorEvent } from '../../observability/index';
import { SANDBOX_ERROR_CODES } from '../../errors/error-codes';
import { generateCrashReport } from './crash-reporter-handler';

export interface UnhandledRejectionHandlerOptions {
  sandboxOutput: Output;
  collector: EventCollector;
  traceRecorder: TraceRecorder | undefined;
  heapProfiler: HeapProfiler | undefined;
  preOOMDetector: PreOOMDetector | undefined;
  heapAnalyzer: HeapAnalyzer | undefined;
  crashReporter: CrashReporter | undefined;
  fileLogger: FileLogger | undefined;
  executionContext: ExecutionContext;
  debugMode?: boolean;
}

/**
 * Setup unhandled rejection handler
 *
 * This handler:
 * 1. Converts rejection reason to Error
 * 2. Logs the error to observability system
 * 3. Exports all observability data (traces, heap snapshots, etc.)
 * 4. Exits with code 1
 *
 * Note: Uses same logic as uncaughtException but with slightly lower severity (9 vs 10)
 */
export function setupUnhandledRejectionHandler(options: UnhandledRejectionHandlerOptions): void {
  const {
    sandboxOutput,
    collector,
    traceRecorder,
    heapProfiler,
    preOOMDetector,
    heapAnalyzer,
    crashReporter,
    fileLogger,
    executionContext,
    debugMode = false,
  } = options;

  process.on('unhandledRejection', async (reason: unknown, promise: Promise<unknown>) => {
    const message = reason instanceof Error ? reason.message : String(reason);
    const error = reason instanceof Error ? reason : new Error(message);

    sandboxOutput.error(`Unhandled rejection: ${message}`, {
      code: SANDBOX_ERROR_CODES.UNHANDLED_REJECTION,
    });

    // Log error event to observability system
    collector.emit(createErrorEvent(
      executionContext,
      {
        name: error.name,
        message: error.message,
        code: (error as any).code,
        stack: error.stack?.split('\n') || [],
        severity: 9, // Critical (slightly less than uncaught exception)
      },
      {
        tags: ['crash', 'unhandled-rejection'],
        aiHints: {
          severity: 9,
          category: 'crash',
          anomaly: true,
        },
      }
    ));

    // CRITICAL: Export all observability data before exit
    await generateCrashReport({
      error,
      errorType: 'unhandled-rejection',
      collector,
      traceRecorder,
      heapProfiler,
      preOOMDetector,
      heapAnalyzer,
      crashReporter,
      fileLogger,
      executionContext,
      debugMode,
    });

    // Unhandled rejection uses same logic as uncaughtException (handled above)
    process.exit(1);
  });
}
