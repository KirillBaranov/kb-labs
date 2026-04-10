/**
 * @module @kb-labs/core-sandbox/observability
 * Production-grade observability system with AI readiness
 */

// Core exports
export * from './events/schema';
export * from './events/collector';
export * from './events/context';

// Outputs
export * from './outputs/types';
export * from './outputs/file-logger';

// Tracing
export * from './tracing/types';
export * from './tracing/trace-recorder';

// Profiling
export * from './profiling/heap-profiler';
export * from './profiling/pre-oom-detector';
export * from './profiling/heap-analyzer';

// Analysis
export * from './analysis/pattern-detector';

// Outputs
export * from './outputs/crash-reporter';

// Convenience function to setup observability
import { getGlobalCollector } from './events/collector';
import { createFileLogger } from './outputs/file-logger';
import type { FileLoggerOptions } from './outputs/file-logger';
import { TraceRecorder } from './tracing/trace-recorder';
import { HeapProfiler } from './profiling/heap-profiler';
import { PreOOMDetector } from './profiling/pre-oom-detector';
import { HeapAnalyzer } from './profiling/heap-analyzer';
import { CrashReporter } from './outputs/crash-reporter';
import { PatternDetector } from './analysis/pattern-detector';

/**
 * Setup observability with default configuration
 */
export function setupObservability(options: {
  fileLogger?: Partial<FileLoggerOptions>;
  enableTracing?: boolean;
  enableHeapProfiling?: boolean;
  enablePatternDetection?: boolean;
  enablePreOOMDetection?: boolean;
  heapProfileInterval?: number; // milliseconds
  logDir?: string;
} = {}) {
  // Check if debug mode is enabled
  const DEBUG_MODE = process.env.DEBUG_SANDBOX === '1' || process.env.NODE_ENV === 'development';

  const collector = getGlobalCollector();
  const logDir = options.logDir || '/tmp';

  // Add file logger
  const fileLogger = createFileLogger({
    name: 'file-logger',
    logDir,
    ...options.fileLogger,
  });
  collector.addSink(fileLogger);

  // Log initialization
  const logFile = fileLogger.getCurrentLogFile();
  if (logFile && DEBUG_MODE) {
    process.stderr.write(`[Observability] Logging to: ${logFile}\n`);
  }

  // Optional: Add trace recorder
  let traceRecorder: TraceRecorder | undefined;
  if (options.enableTracing) {
    traceRecorder = new TraceRecorder();
    if (DEBUG_MODE) {
      process.stderr.write(`[Observability] Performance tracing enabled\n`);
    }
  }

  // Optional: Add heap profiler
  let heapProfiler: HeapProfiler | undefined;
  if (options.enableHeapProfiling) {
    heapProfiler = new HeapProfiler({
      snapshotDir: logDir,
      interval: options.heapProfileInterval || 30000, // 30s default
    });
    heapProfiler.start();
    if (DEBUG_MODE) {
      process.stderr.write(`[Observability] Heap profiling enabled (${options.heapProfileInterval || 30000}ms interval)\n`);
    }
  }

  // Optional: Add pattern detector
  let patternDetector: PatternDetector | undefined;
  if (options.enablePatternDetection) {
    patternDetector = new PatternDetector();

    // Create a sink that analyzes events
    collector.addSink({
      write: (event) => {
        const matches = patternDetector!.analyze(event);

        // Log detected patterns
        if (DEBUG_MODE) {
          for (const match of matches) {
            process.stderr.write(
              `[PatternDetector] ⚠️  ${match.pattern.name} (confidence: ${(match.confidence * 100).toFixed(0)}%)\n` +
              `  ${match.pattern.description}\n` +
              `  Evidence: ${match.evidence.join(', ')}\n`
            );

            if (match.recommendation) {
              process.stderr.write(`  💡 ${match.recommendation.title}: ${match.recommendation.description}\n`);
            }
          }
        }
      },
    });

    if (DEBUG_MODE) {
      process.stderr.write(`[Observability] Pattern detection enabled\n`);
    }
  }

  // Optional: Add pre-OOM detector
  let preOOMDetector: PreOOMDetector | undefined;
  let heapAnalyzer: HeapAnalyzer | undefined;
  let crashReporter: CrashReporter | undefined;

  if (options.enablePreOOMDetection ?? true) { // Enabled by default
    preOOMDetector = new PreOOMDetector({
      snapshotDir: logDir,
      threshold: 0.85, // 85% of heap limit
      checkInterval: 1000, // Check every second
      verbose: DEBUG_MODE, // Pass debug mode to PreOOMDetector
    });
    preOOMDetector.start();

    heapAnalyzer = new HeapAnalyzer();
    crashReporter = new CrashReporter();

    if (DEBUG_MODE) {
      process.stderr.write(`[Observability] Pre-OOM detection enabled (threshold: 85%)\n`);
    }
  }

  return {
    collector,
    fileLogger,
    traceRecorder,
    heapProfiler,
    patternDetector,
    preOOMDetector,
    heapAnalyzer,
    crashReporter,
  };
}
