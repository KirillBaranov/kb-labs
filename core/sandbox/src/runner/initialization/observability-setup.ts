/**
 * @module @kb-labs/core-sandbox/runner/initialization/observability-setup
 * Initialize observability system for subprocess execution
 */

import {
  setupObservability,
  createExecutionContext,
  createLogEvent,
  type EventCollector,
  type FileLogger,
  type TraceRecorder,
  type HeapProfiler,
  type PatternDetector,
  type PreOOMDetector,
  type HeapAnalyzer,
  type CrashReporter,
  type ExecutionContext as ObservabilityExecutionContext,
} from '../../observability/index';

export interface ObservabilitySetupOptions {
  logDir?: string;
  fileLogger?: {
    enabled?: boolean;
    bufferSize?: number;
    flushInterval?: number;
  };
  enableTracing?: boolean;
  enableHeapProfiling?: boolean;
  enablePatternDetection?: boolean;
  enablePreOOMDetection?: boolean;
  heapProfileInterval?: number;
  pluginId?: string;
  pluginVersion?: string;
  operationId?: string;
  sessionId?: string;
}

export interface ObservabilityContext {
  collector: EventCollector;
  fileLogger: FileLogger | undefined;
  traceRecorder: TraceRecorder | undefined;
  heapProfiler: HeapProfiler | undefined;
  patternDetector: PatternDetector | undefined;
  preOOMDetector: PreOOMDetector | undefined;
  heapAnalyzer: HeapAnalyzer | undefined;
  crashReporter: CrashReporter | undefined;
  executionContext: ObservabilityExecutionContext;
}

/**
 * Initialize observability system with all components
 *
 * This sets up:
 * - Event collector for structured events
 * - File logger for persistent logs
 * - Trace recorder for performance profiling
 * - Heap profiler for memory analysis
 * - Pattern detector for anomaly detection
 * - Pre-OOM detector for crash prevention
 * - Heap analyzer for memory diagnostics
 * - Crash reporter for comprehensive crash reports
 */
export function initializeObservability(options: ObservabilitySetupOptions): ObservabilityContext {
  const {
    logDir = '/tmp',
    fileLogger = {},
    enableTracing = false,
    enableHeapProfiling = false,
    enablePatternDetection = false,
    enablePreOOMDetection = true, // Always enabled for crash diagnostics
    heapProfileInterval = 30000,
    pluginId = 'unknown',
    pluginVersion = '0.0.0',
    operationId,
    sessionId,
  } = options;

  // Setup observability with all advanced features
  const observability = setupObservability({
    logDir,
    fileLogger: {
      enabled: fileLogger.enabled ?? process.env.KB_OBSERVABILITY !== 'false',
      bufferSize: fileLogger.bufferSize ?? 1, // Flush immediately (for debugging crashes)
      flushInterval: fileLogger.flushInterval ?? 100, // Flush every 100ms
    },
    enableTracing: enableTracing || process.env.KB_TRACING === 'true',
    enableHeapProfiling: enableHeapProfiling || process.env.KB_HEAP_PROFILING === 'true',
    enablePatternDetection: enablePatternDetection || process.env.KB_PATTERN_DETECTION === 'true',
    enablePreOOMDetection,
    heapProfileInterval,
  });

  // Create execution context for this subprocess
  const executionContext = createExecutionContext({
    pluginId: pluginId || process.env.KB_PLUGIN_ID || 'unknown',
    pluginVersion: pluginVersion || process.env.KB_PLUGIN_VERSION || '0.0.0',
    operationId: operationId || process.env.KB_OPERATION_ID || crypto.randomUUID(),
    sessionId: sessionId || process.env.KB_SESSION_ID,
  });

  // Log bootstrap start
  observability.collector.emit(createLogEvent(
    executionContext,
    {
      level: 'info',
      message: 'Subprocess bootstrap started',
      metadata: {
        pid: process.pid,
        cwd: process.cwd(),
        nodeVersion: process.version,
      },
    },
    { tags: ['bootstrap', 'startup'] }
  ));

  return {
    ...observability,
    executionContext,
  };
}
