// Bootstrap module - minimal logging to prevent memory issues

/**
 * @module @kb-labs/core-sandbox/runner/bootstrap
 * Bootstrap script for subprocess sandbox execution
 *
 * This script runs in a child process and handles:
 * - Loading and executing plugin handlers
 * - IPC communication with parent process
 * - Log interception and forwarding
 * - Error handling and reporting
 */

// ═══════════════════════════════════════════════════════════════════════════
// LAYER 0: LOGGING INITIALIZATION (BEFORE EVERYTHING!)
// ═══════════════════════════════════════════════════════════════════════════
// CRITICAL: Initialize logging FIRST to ensure KB_LOG_LEVEL from parent is respected
// This must happen before observability, output, or any other initialization
import { initializeSubprocessLogging } from './initialization/logging-setup';

const { getSubprocessLogger } = initializeSubprocessLogging({
  enforceLevel: true, // Lock config - parent process dictates log level
});

// ═══════════════════════════════════════════════════════════════════════════
// LAYER 1: SOURCE MAPS + EXTENDED STACK TRACES
// ═══════════════════════════════════════════════════════════════════════════
import { setupSourceMaps } from './initialization/source-maps';

// Setup source maps and stack trace limit
setupSourceMaps({ enabled: false });

// ═══════════════════════════════════════════════════════════════════════════
// LAYER 2: OBSERVABILITY SYSTEM
// ═══════════════════════════════════════════════════════════════════════════
import { initializeObservability } from './initialization/observability-setup';

// Initialize observability with all advanced features
const { collector, fileLogger, traceRecorder, heapProfiler, patternDetector, preOOMDetector, heapAnalyzer, crashReporter, executionContext } = initializeObservability({
  logDir: process.env.KB_LOG_DIR || '/tmp',
});

// ═══════════════════════════════════════════════════════════════════════════

import type { HandlerRef, ExecutionContext } from '../types/index';
import type { SerializableContext } from './ipc-serializer';
import { normalizeError } from '../errors/handler-error';
import type { Output } from '@kb-labs/core-sys/output';
import { sendReadySignal } from './initialization/ipc-ready';

// Signal readiness IMMEDIATELY - before any other operations
// CRITICAL: Parent process is waiting for this message
sendReadySignal();

// Check if debug mode is enabled (from environment or parent process)
const DEBUG_MODE = process.env.KB_PLUGIN_DEV_MODE === 'true' || process.env.DEBUG?.includes('@kb-labs');

// Create unified Output for sandbox
import { setupSandboxOutput } from './initialization/output-setup';
const sandboxOutput: Output = setupSandboxOutput({
  verbosity: DEBUG_MODE ? 'debug' : 'normal',
  category: 'sandbox:bootstrap',
  format: 'human',
});

// ═══════════════════════════════════════════════════════════════════════════
// LAYER 9: MODULE LOAD TRACKING + HEAP MONITORING
// ═══════════════════════════════════════════════════════════════════════════
import { initializeDiagnostics } from './initialization/diagnostics-setup';

const { moduleTracker, heapMonitor } = initializeDiagnostics({
  moduleTracker: {
    maxHistory: 100,
    slowModuleThreshold: 100,
  },
  heapMonitor: {
    thresholds: [50, 70, 90],
    snapshotDir: process.env.KB_CRASH_DIR || '/tmp',
    interval: 1000,
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// LOGGING: Console interception
// ═══════════════════════════════════════════════════════════════════════════
import { interceptConsole } from './logging/console-interceptor';

// Intercept console methods to prevent infinite recursion
interceptConsole();

// ═══════════════════════════════════════════════════════════════════════════
// EXECUTION: Handler execution modules
// ═══════════════════════════════════════════════════════════════════════════
import { resolveHandlerPath } from './execution/path-resolver';
import { loadHandler } from './execution/handler-loader';
import { executeHandlerFn, type HandlerResult } from './execution/handler-executor';

// ═══════════════════════════════════════════════════════════════════════════
// CONTEXT: Context recreation from serialized IPC data
// ═══════════════════════════════════════════════════════════════════════════
import { recreateContext as recreateContextInternal } from './context/context-recreator';

/**
 * Recreate context from serialized IPC data
 * Wrapper around context-recreator module
 */
async function recreateContext(serializedCtx: SerializableContext): Promise<ExecutionContext> {
  return recreateContextInternal({
    serializedCtx,
    sandboxOutput,
    debugMode: DEBUG_MODE,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// IPC: Message handling and communication with parent process
// ═══════════════════════════════════════════════════════════════════════════
import { setupMessageHandler } from './ipc/message-handler';

// ═══════════════════════════════════════════════════════════════════════════
// ERROR HANDLING: Uncaught exceptions and unhandled rejections
// ═══════════════════════════════════════════════════════════════════════════
import { setupUncaughtExceptionHandler } from './error-handling/uncaught-exception';
import { setupUnhandledRejectionHandler } from './error-handling/unhandled-rejection';

/**
 * Load and execute handler
 * Uses modular execution system: path resolution → loading → execution
 */
async function executeHandler(
  handlerRef: HandlerRef,
  input: unknown,
  ctx: ExecutionContext
): Promise<HandlerResult> {
  try {
    // Get plugin root from context (required)
    if (!ctx.pluginRoot) {
      throw new Error('pluginRoot is required in ExecutionContext');
    }

    // Step 1: Resolve handler path
    const { fileUrl } = await resolveHandlerPath({
      pluginRoot: ctx.pluginRoot,
      handlerRef,
    });

    // Step 2: Load handler module
    const { handlerFn } = await loadHandler({
      handlerUrl: fileUrl,
      handlerRef,
      output: sandboxOutput,
      debugMode: DEBUG_MODE,
    });

    // Step 3: Execute handler function
    return await executeHandlerFn({
      handlerFn,
      input,
      ctx,
      output: sandboxOutput,
    });
  } catch (error) {
    // Catch errors from resolution/loading stages
    const normalizedError = normalizeError(error);
    return {
      ok: false,
      error: {
        code: normalizedError.code,
        message: normalizedError.message,
        stack: normalizedError.stack,
      },
    };
  }
}

// Setup IPC message handler
setupMessageHandler({
  sandboxOutput,
  collector,
  traceRecorder,
  executionContext,
  recreateContext,
  executeHandler,
});

// Setup error handlers
setupUncaughtExceptionHandler({
  sandboxOutput,
  collector,
  traceRecorder,
  heapProfiler,
  preOOMDetector,
  heapAnalyzer,
  crashReporter,
  fileLogger,
  executionContext,
  debugMode: DEBUG_MODE,
});

setupUnhandledRejectionHandler({
  sandboxOutput,
  collector,
  traceRecorder,
  heapProfiler,
  preOOMDetector,
  heapAnalyzer,
  crashReporter,
  fileLogger,
  executionContext,
  debugMode: DEBUG_MODE,
});

// Note: READY message is sent at the top of the file, immediately after imports
// This ensures parent process receives it before any initialization code runs

