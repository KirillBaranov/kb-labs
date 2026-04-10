/**
 * @module @kb-labs/core-sandbox/observability/outputs/crash-reporter
 * Rich crash report generation with diagnostics
 *
 * Generates beautiful, actionable crash reports with memory analysis
 */

import type { HeapAnalysisResult } from '../profiling/heap-analyzer';
import type { OOMWarning } from '../profiling/pre-oom-detector';

export interface CrashContext {
  pluginId: string;
  pluginVersion: string;
  command: string;
  errorName: string;
  errorMessage: string;
  errorStack?: string[];
  timestamp: number;
  duration: number; // seconds since start
  pid: number;
}

export interface CrashDiagnostics {
  oomWarning?: OOMWarning;
  heapAnalysis?: HeapAnalysisResult;
  memoryTimeline?: Array<{ time: number; heapMB: number }>;
  snapshotPath?: string;
  tracePath?: string;
  logPath?: string;
}

export interface CrashReportOptions {
  includeStackTrace?: boolean;
  includeRecommendations?: boolean;
  maxStackLines?: number;
}

/**
 * CrashReporter - generates rich crash reports
 */
export class CrashReporter {
  /**
   * Generate crash report
   */
  generate(
    context: CrashContext,
    diagnostics: CrashDiagnostics,
    options: CrashReportOptions = {}
  ): string {
    const {
      includeStackTrace = true,
      includeRecommendations = true,
      maxStackLines = 10,
    } = options;

    const lines: string[] = [];

    // Header
    lines.push('╔══════════════════════════════════════════════════════════════╗');
    lines.push('║ 💥 PLATFORM CRASH REPORT                                    ║');
    lines.push('╠══════════════════════════════════════════════════════════════╣');

    // Context
    lines.push(`║ Plugin: ${context.pluginId} v${context.pluginVersion}`.padEnd(63) + '║');
    lines.push(`║ Command: ${context.command}`.padEnd(63) + '║');
    lines.push(`║ Error: ${context.errorName} (FATAL)`.padEnd(63) + '║');
    lines.push(`║ Time: ${context.duration.toFixed(1)}s into execution`.padEnd(63) + '║');
    lines.push('╠══════════════════════════════════════════════════════════════╣');

    // Memory timeline
    if (diagnostics.memoryTimeline && diagnostics.memoryTimeline.length > 0) {
      lines.push('║ 📊 MEMORY TIMELINE                                          ║');

      const timeline = diagnostics.memoryTimeline;
      const maxHeap = Math.max(...timeline.map(t => t.heapMB));

      for (const entry of timeline.slice(-5)) {
        const time = entry.time.toFixed(0).padStart(3);
        const heapMB = entry.heapMB.toFixed(0).padStart(4);
        const barLength = Math.floor((entry.heapMB / maxHeap) * 50);
        const bar = '█'.repeat(barLength);
        const isOOM = entry.heapMB >= maxHeap * 0.98;
        const suffix = isOOM ? ' 💥 OOM (limit reached)' : '';
        lines.push(`║  ${time}s: ${heapMB}MB  ${bar}${suffix}`.padEnd(63) + '║');
      }
      lines.push('║                                                              ║');
    }

    // Top memory consumers
    if (diagnostics.heapAnalysis) {
      lines.push('║ 🔥 TOP MEMORY CONSUMERS                                     ║');

      const consumers = diagnostics.heapAnalysis.topConsumers.slice(0, 5);
      for (let i = 0; i < consumers.length; i++) {
        const consumer = consumers[i]!;
        const name = this.truncate(consumer.name, 25);
        const sizeMB = (consumer.retainedSize / 1024 / 1024).toFixed(0);
        const percent = consumer.percentage.toFixed(0);
        lines.push(`║  ${i + 1}. ${name.padEnd(25)} ${sizeMB.padStart(6)}MB (${percent}%)`.padEnd(63) + '║');
      }
      lines.push('║                                                              ║');
    }

    // Root cause
    if (diagnostics.heapAnalysis && diagnostics.heapAnalysis.patterns.length > 0) {
      const pattern = diagnostics.heapAnalysis.patterns[0]!;
      const confidence = (pattern.confidence * 100).toFixed(0);

      lines.push('║ 🎯 ROOT CAUSE (' + confidence + '% confidence)'.padEnd(47) + '║');
      lines.push(`║  Pattern: ${pattern.pattern}`.padEnd(63) + '║');
      lines.push(`║  ${this.wrapText(pattern.description, 60)}`.padEnd(63) + '║');
      lines.push('║                                                              ║');
    }

    // Recommendations
    if (includeRecommendations && diagnostics.heapAnalysis) {
      const recommendations = this.generateRecommendations(diagnostics.heapAnalysis);
      if (recommendations.length > 0) {
        lines.push('║ 💡 RECOMMENDED FIXES                                        ║');
        for (const rec of recommendations.slice(0, 3)) {
          for (const line of this.wrapText(rec, 60)) {
            lines.push(`║  • ${line}`.padEnd(63) + '║');
          }
        }
        lines.push('║                                                              ║');
      }
    }

    // Stack trace
    if (includeStackTrace && context.errorStack && context.errorStack.length > 0) {
      lines.push('║ 📋 STACK TRACE (top ' + Math.min(maxStackLines, context.errorStack.length) + ' lines)'.padEnd(47) + '║');
      for (let i = 0; i < Math.min(maxStackLines, context.errorStack.length); i++) {
        const line = this.truncate(context.errorStack[i]!.trim(), 60);
        lines.push(`║  ${line}`.padEnd(63) + '║');
      }
      lines.push('║                                                              ║');
    }

    // Diagnostics files
    lines.push('║ 📁 DIAGNOSTICS SAVED                                        ║');
    if (diagnostics.snapshotPath) {
      const path = this.truncate(diagnostics.snapshotPath, 58);
      lines.push(`║  Heap: ${path}`.padEnd(63) + '║');
    }
    if (diagnostics.tracePath) {
      const path = this.truncate(diagnostics.tracePath, 58);
      lines.push(`║  Trace: ${path}`.padEnd(63) + '║');
    }
    if (diagnostics.logPath) {
      const path = this.truncate(diagnostics.logPath, 58);
      lines.push(`║  Log: ${path}`.padEnd(63) + '║');
    }

    // Footer
    lines.push('╚══════════════════════════════════════════════════════════════╝');

    return lines.join('\n');
  }

  /**
   * Generate recommendations based on analysis
   */
  private generateRecommendations(analysis: HeapAnalysisResult): string[] {
    const recommendations: string[] = [];

    for (const pattern of analysis.patterns) {
      switch (pattern.pattern) {
        case 'large-array-allocation':
          recommendations.push('Reduce batch sizes in array operations');
          recommendations.push('Process data in smaller chunks with streaming');
          recommendations.push('Add explicit gc() calls between batches');
          break;

        case 'string-accumulation':
          recommendations.push('Avoid .split() on large files, use streaming instead');
          recommendations.push('Replace string concatenation with Buffer or streams');
          recommendations.push('Limit string operations in hot loops');
          break;

        case 'closure-retention':
          recommendations.push('Remove unused event listeners');
          recommendations.push('Clear callbacks and closures after use');
          recommendations.push('Use WeakMap/WeakSet for temporary references');
          break;

        case 'code-bloat':
          recommendations.push('Reduce dependency tree size');
          recommendations.push('Avoid dynamic require/import in loops');
          recommendations.push('Use lazy loading for large modules');
          break;

        case 'single-large-consumer': {
          const topConsumer = analysis.topConsumers[0]!;
          if (topConsumer.type === 'array') {
            recommendations.push(`Check array allocation for: ${topConsumer.name}`);
          } else if (topConsumer.type === 'string') {
            recommendations.push(`Check string operations for: ${topConsumer.name}`);
          } else {
            recommendations.push(`Investigate large consumer: ${topConsumer.type}:${topConsumer.name}`);
          }
          break;
        }
      }
    }

    // General recommendations based on top consumers
    const topConsumer = analysis.topConsumers[0];
    if (topConsumer) {
      const percent = topConsumer.percentage;
      if (percent > 50) {
        recommendations.push(`Single consumer uses ${percent.toFixed(0)}% - focus optimization here`);
      }
    }

    return recommendations;
  }

  /**
   * Truncate text to max length
   */
  private truncate(text: string, maxLen: number): string {
    if (text.length <= maxLen) {
      return text;
    }
    return text.substring(0, maxLen - 3) + '...';
  }

  /**
   * Wrap text to multiple lines
   */
  private wrapText(text: string, maxLen: number): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      if (currentLine.length + word.length + 1 <= maxLen) {
        currentLine += (currentLine ? ' ' : '') + word;
      } else {
        if (currentLine) {lines.push(currentLine);}
        currentLine = word;
      }
    }

    if (currentLine) {lines.push(currentLine);}
    return lines;
  }
}

/**
 * Create CrashReporter
 */
export function createCrashReporter(): CrashReporter {
  return new CrashReporter();
}
