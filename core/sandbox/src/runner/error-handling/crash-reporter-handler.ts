/**
 * @module @kb-labs/core-sandbox/runner/error-handling/crash-reporter-handler
 * Generate and export crash reports with observability data
 */

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

export interface CrashReportOptions {
  error: Error;
  errorType: 'uncaught-exception' | 'unhandled-rejection';
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
 * Generate comprehensive crash report with all observability data
 *
 * This exports:
 * - Event logs (collector.flush())
 * - Trace recordings (traceRecorder.export())
 * - Heap snapshots (heapProfiler + preOOMDetector)
 * - Memory timeline and growth analysis
 * - Rich crash report with recommendations
 */
export async function generateCrashReport(options: CrashReportOptions): Promise<void> {
  const {
    error,
    errorType,
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

  try {
    // Flush event logs
    await collector.flush();

    // Export trace recording
    let tracePath: string | undefined;
    if (traceRecorder) {
      tracePath = await traceRecorder.export();
      if (debugMode) {
        process.stderr.write(`[Observability] Trace exported to: ${tracePath}\n`);
      }
    }

    // Stop heap profiler (it auto-exports snapshots)
    if (heapProfiler) {
      heapProfiler.stop();
      if (debugMode) {
        process.stderr.write(`[Observability] Heap profiler stopped\n`);
      }
    }

    // Stop pre-OOM detector
    if (preOOMDetector) {
      preOOMDetector.stop();
    }

    // Generate rich crash report (only for uncaught exceptions)
    if (errorType === 'uncaught-exception' && crashReporter && heapAnalyzer && preOOMDetector) {
      try {
        const startTime = Date.now();

        // Get OOM warning if available
        const oomWarning = preOOMDetector.getLastWarning() || undefined;

        // Analyze heap snapshot if available
        let heapAnalysis;
        const snapshotPath = preOOMDetector.getSnapshotPath() || undefined;
        if (snapshotPath && heapAnalyzer) {
          try {
            heapAnalysis = await heapAnalyzer.analyze(snapshotPath);

            // Print detailed analysis
            process.stderr.write('\n');
            process.stderr.write(heapAnalyzer.formatAnalysis(heapAnalysis));
            process.stderr.write('\n');
          } catch (analyzeErr) {
            process.stderr.write(`[CrashReporter] Heap analysis failed: ${analyzeErr}\n`);
          }
        }

        // Build memory timeline
        const memoryGrowth = preOOMDetector.getMemoryGrowthSummary();
        const memoryTimeline: Array<{ time: number; heapMB: number }> = [];

        if (memoryGrowth) {
          // Reconstruct approximate timeline
          const durationSec = memoryGrowth.duration;
          const steps = 5;

          for (let i = 0; i <= steps; i++) {
            const time = (durationSec / steps) * i;
            const heapMB = (memoryGrowth.totalGrowth / steps) * i / 1024 / 1024;
            memoryTimeline.push({ time, heapMB });
          }
        }

        // Generate crash report
        const report = crashReporter.generate(
          {
            pluginId: executionContext.pluginId,
            pluginVersion: executionContext.pluginVersion,
            command: process.argv.slice(2).join(' '),
            errorName: error.name,
            errorMessage: error.message,
            errorStack: error.stack?.split('\n'),
            timestamp: Date.now(),
            duration: (Date.now() - startTime) / 1000,
            pid: process.pid,
          },
          {
            oomWarning,
            heapAnalysis,
            memoryTimeline,
            snapshotPath,
            tracePath: tracePath || undefined,
            logPath: fileLogger?.getCurrentLogFile() || undefined,
          },
          {
            includeStackTrace: true,
            includeRecommendations: true,
            maxStackLines: 10,
          }
        );

        // Print beautiful crash report
        process.stderr.write('\n');
        process.stderr.write(report);
        process.stderr.write('\n');

        // Send to parent via IPC
        if (process.send) {
          try {
            process.send({
              type: 'CRASH',
              payload: {
                report,
                snapshotPath,
                tracePath,
                logPath: fileLogger?.getCurrentLogFile(),
              },
            });
          } catch {
            // IPC may fail, but report is printed to stderr
          }
        }
      } catch (reportError) {
        process.stderr.write(`[CrashReporter] Report generation failed: ${reportError}\n`);
      }
    }
  } catch (flushErr) {
    if (debugMode) {
      process.stderr.write(`[Observability] Cleanup failed: ${flushErr}\n`);
    }
  }
}
