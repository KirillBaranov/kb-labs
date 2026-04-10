/**
 * @module @kb-labs/core-sandbox/runner/error-handling/uncaught-exception
 * Handle uncaught exceptions with crash reporting
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

export interface UncaughtExceptionHandlerOptions {
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
 * Setup uncaught exception handler
 *
 * This handler:
 * 1. Logs the error to observability system
 * 2. Exports all observability data (traces, heap snapshots, etc.)
 * 3. Generates comprehensive crash report
 * 4. Exits with code 1
 */
export function setupUncaughtExceptionHandler(options: UncaughtExceptionHandlerOptions): void {
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

  process.on('uncaughtException', async (error: Error, origin: string) => {
    sandboxOutput.error(`Uncaught exception: ${error.message}`, {
      code: SANDBOX_ERROR_CODES.UNHANDLED_EXCEPTION,
    });

    // Log error event to observability system
    collector.emit(createErrorEvent(
      executionContext,
      {
        name: error.name,
        message: error.message,
        code: (error as any).code,
        stack: error.stack?.split('\n') || [],
        severity: 10, // Critical
      },
      {
        tags: ['crash', 'uncaught-exception'],
        aiHints: {
          severity: 10,
          category: 'crash',
          anomaly: true,
        },
      }
    ));

    // CRITICAL: Export all observability data before exit
    await generateCrashReport({
      error,
      errorType: 'uncaught-exception',
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

    process.exit(1);
  });
}
