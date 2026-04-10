/**
 * @module @kb-labs/core-sandbox/diagnostics/crash-reporter
 * Enhanced crash reporting with full diagnostic context
 */

import * as v8 from 'node:v8';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { ModuleTracker } from './module-tracker';

export interface CrashReport {
  timestamp: string;
  pid: number;
  uptime: number;

  error: {
    message: string;
    stack?: string;
    name: string;
    code?: string;
    origin?: string;
  };

  process: {
    pid: number;
    uptime: number;
    memoryUsage: NodeJS.MemoryUsage;
    cpuUsage: NodeJS.CpuUsage;
    versions: NodeJS.ProcessVersions;
    execArgv: string[];
    argv: string[];
  };

  v8: {
    heapStatistics: v8.HeapInfo;
    heapSpaceStatistics: v8.HeapSpaceInfo[];
  };

  modules?: {
    loaded: string[];
    lastLoaded: string[];
    timeline?: Array<{ name: string; timestamp: number; duration: number }>;
    currentlyLoading?: string | null;
  };
}

export interface CrashReporterOptions {
  crashDir?: string;
  generateHeapSnapshot?: boolean;
  moduleTracker?: ModuleTracker;
}

export class CrashReporter {
  private crashDir: string;
  private shouldGenerateHeapSnapshot: boolean;
  private moduleTracker?: ModuleTracker;

  constructor(options: CrashReporterOptions = {}) {
    this.crashDir = options.crashDir || '/tmp';
    this.shouldGenerateHeapSnapshot = options.generateHeapSnapshot ?? true;
    this.moduleTracker = options.moduleTracker;
  }

  /**
   * Generate crash report from error
   */
  async generateReport(error: Error, origin: string = 'uncaughtException'): Promise<CrashReport> {
    const report: CrashReport = {
      timestamp: new Date().toISOString(),
      pid: process.pid,
      uptime: process.uptime(),

      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
        code: (error as any).code,
        origin,
      },

      process: {
        pid: process.pid,
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage(),
        versions: process.versions,
        execArgv: process.execArgv,
        argv: process.argv,
      },

      v8: {
        heapStatistics: v8.getHeapStatistics(),
        heapSpaceStatistics: v8.getHeapSpaceStatistics(),
      },
    };

    // Add module tracking data if available
    if (this.moduleTracker) {
      const lastLoaded = this.moduleTracker.getLast(20);
      const currentlyLoading = this.moduleTracker.getCurrentlyLoading();

      report.modules = {
        loaded: Object.keys(require.cache),
        lastLoaded: lastLoaded.map(m => `${m.name} (${m.duration.toFixed(1)}ms)`),
        timeline: lastLoaded,
        currentlyLoading: currentlyLoading?.name || null,
      };
    }

    return report;
  }

  /**
   * Save crash report to file
   */
  async saveReport(report: CrashReport): Promise<string> {
    const filename = `crash-${report.pid}-${Date.now()}.json`;
    const filepath = path.join(this.crashDir, filename);

    try {
      await fs.writeFile(filepath, JSON.stringify(report, null, 2), 'utf8');
      return filepath;
    } catch (err) {
      // If we can't save to configured dir, try /tmp as fallback
      const fallbackPath = path.join('/tmp', filename);
      try {
        await fs.writeFile(fallbackPath, JSON.stringify(report, null, 2), 'utf8');
        return fallbackPath;
      } catch {
        // Last resort: write to stderr
        console.error('[CRASH-REPORTER] Failed to save report, dumping to stderr:');
        console.error(JSON.stringify(report, null, 2));
        return '<failed>';
      }
    }
  }

  /**
   * Generate heap snapshot
   */
  async generateHeapSnapshot(): Promise<string | null> {
    if (!this.shouldGenerateHeapSnapshot) {
      return null;
    }

    try {
      const filename = `crash-heap-${process.pid}.heapsnapshot`;
      const filepath = path.join(this.crashDir, filename);
      return v8.writeHeapSnapshot(filepath);
    } catch (err) {
      console.error('[CRASH-REPORTER] Failed to generate heap snapshot:', err);
      return null;
    }
  }

  /**
   * Format crash report for console output
   */
  formatForConsole(report: CrashReport, reportPath: string, heapPath: string | null): string {
    const memUsage = report.process.memoryUsage;
    const heapStats = report.v8.heapStatistics;
    const heapUsedMB = (memUsage.heapUsed / 1024 / 1024).toFixed(0);
    const heapLimitMB = (heapStats.heap_size_limit / 1024 / 1024).toFixed(0);
    const percentUsed = ((memUsage.heapUsed / heapStats.heap_size_limit) * 100).toFixed(1);

    const lastModules = report.modules?.lastLoaded.slice(-5) || [];
    const currentlyLoading = report.modules?.currentlyLoading;

    let output = `
╔═══════════════════════════════════════════════════════════╗
║              SUBPROCESS CRASHED                           ║
╠═══════════════════════════════════════════════════════════╣
║ Error: ${report.error.message.substring(0, 50)}${report.error.message.length > 50 ? '...' : ''}
║ Type: ${report.error.name}
${report.error.code ? `║ Code: ${report.error.code}` : ''}
║
║ Process:
║   PID: ${report.pid}
║   Uptime: ${report.uptime.toFixed(1)}s
║
║ Memory:
║   Used: ${heapUsedMB}MB / ${heapLimitMB}MB (${percentUsed}%)
║   RSS: ${(memUsage.rss / 1024 / 1024).toFixed(0)}MB
║   External: ${(memUsage.external / 1024 / 1024).toFixed(0)}MB
║`;

    if (currentlyLoading) {
      output += `
║
║ Currently Loading:
║   ${currentlyLoading}`;
    }

    if (lastModules.length > 0) {
      output += `
║
║ Last Loaded Modules:`;
      lastModules.forEach(mod => {
        output += `\n║   - ${mod}`;
      });
    }

    output += `
║
║ Diagnostics Saved:
║   📄 Crash report: ${reportPath}`;

    if (heapPath) {
      output += `
║   💾 Heap snapshot: ${heapPath}`;
    }

    output += `
║
║ Stack Trace:
${formatStackTrace(report.error.stack || '', 5)}
║
║ To analyze:
║   1. Open ${heapPath || 'heap snapshot'} in Chrome DevTools
║   2. Review ${reportPath}
╚═══════════════════════════════════════════════════════════╝
`;

    return output;
  }

  /**
   * Handle crash - generate and save all diagnostics
   */
  async handleCrash(error: Error, origin: string = 'uncaughtException'): Promise<{
    report: CrashReport;
    reportPath: string;
    heapPath: string | null;
  }> {
    // Generate report
    const report = await this.generateReport(error, origin);

    // Save report
    const reportPath = await this.saveReport(report);

    // Generate heap snapshot
    const heapPath = await this.generateHeapSnapshot();

    // Log formatted output
    const formattedOutput = this.formatForConsole(report, reportPath, heapPath);
    console.error(formattedOutput);

    // Also log raw JSON to stderr for parsing
    console.error('[CRASH-REPORT-JSON]', JSON.stringify(report));

    return {
      report,
      reportPath,
      heapPath,
    };
  }
}

/**
 * Format stack trace for console (limit lines)
 */
function formatStackTrace(stack: string, maxLines: number = 5): string {
  const lines = stack.split('\n');
  const limitedLines = lines.slice(0, maxLines + 1); // +1 for error message line

  return limitedLines
    .map(line => `║   ${line}`)
    .join('\n');
}
