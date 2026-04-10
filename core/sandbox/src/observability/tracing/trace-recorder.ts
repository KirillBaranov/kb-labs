/**
 * @module @kb-labs/core-sandbox/observability/tracing/trace-recorder
 * Chrome Tracing format recorder
 *
 * Records performance traces in Chrome Tracing format for visualization in chrome://tracing
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { ChromeTraceEvent, ChromeTraceFormat } from './types';

export interface TraceRecorderOptions {
  /** Output directory */
  traceDir?: string;

  /** Output file pattern */
  filePattern?: string; // e.g., 'kb-trace-{pid}-{timestamp}.json'

  /** Enable/disable */
  enabled?: boolean;
}

/**
 * Active span (for matching begin/end)
 */
interface ActiveSpan {
  name: string;
  category: string;
  startTime: number;
  args?: Record<string, any>;
}

/**
 * TraceRecorder - records performance traces
 *
 * Usage:
 * ```
 * const recorder = new TraceRecorder();
 * recorder.begin('operation', 'function', { arg: 'value' });
 * // ... work ...
 * recorder.end('operation');
 * await recorder.export('/tmp/trace.json');
 * ```
 */
export class TraceRecorder {
  private events: ChromeTraceEvent[] = [];
  private activeSpans: Map<string, ActiveSpan> = new Map();
  private traceDir: string;
  private filePattern: string;
  private enabled: boolean;
  private startTime: number;
  private pid: number;

  constructor(options: TraceRecorderOptions = {}) {
    this.traceDir = options.traceDir || '/tmp';
    this.filePattern = options.filePattern || 'kb-trace-{pid}-{timestamp}.json';
    this.enabled = options.enabled ?? true;
    this.startTime = performance.now();
    this.pid = process.pid;

    if (this.enabled) {
      // Add metadata event
      this.addMetadataEvent();
    }
  }

  /**
   * Add metadata event
   */
  private addMetadataEvent(): void {
    this.events.push({
      name: 'process_name',
      ph: 'M',
      pid: this.pid,
      tid: 0,
      args: {
        name: `kb-subprocess-${this.pid}`,
      },
    } as any);

    this.events.push({
      name: 'thread_name',
      ph: 'M',
      pid: this.pid,
      tid: 0,
      args: {
        name: 'Main',
      },
    } as any);
  }

  /**
   * Begin span
   */
  begin(name: string, category: string = 'function', args?: Record<string, any>): void {
    if (!this.enabled) {return;}

    const now = performance.now();
    const ts = this.timeToMicroseconds(now);

    this.events.push({
      name,
      cat: category,
      ph: 'B',
      ts,
      pid: this.pid,
      tid: 0,
      args,
    });

    // Track active span
    this.activeSpans.set(name, {
      name,
      category,
      startTime: now,
      args,
    });
  }

  /**
   * End span
   */
  end(name: string): void {
    if (!this.enabled) {return;}

    const now = performance.now();
    const ts = this.timeToMicroseconds(now);

    this.events.push({
      name,
      ph: 'E',
      ts,
      pid: this.pid,
      tid: 0,
    });

    // Remove from active spans
    this.activeSpans.delete(name);
  }

  /**
   * Complete event (duration event)
   */
  complete(name: string, category: string, startTime: number, endTime: number, args?: Record<string, any>): void {
    if (!this.enabled) {return;}

    const ts = this.timeToMicroseconds(startTime);
    const dur = this.timeToMicroseconds(endTime - startTime);

    this.events.push({
      name,
      cat: category,
      ph: 'X',
      ts,
      dur,
      pid: this.pid,
      tid: 0,
      args,
    });
  }

  /**
   * Instant event (point in time)
   */
  instant(name: string, category: string, args?: Record<string, any>, scope: 'g' | 'p' | 't' = 't'): void {
    if (!this.enabled) {return;}

    const now = performance.now();
    const ts = this.timeToMicroseconds(now);

    this.events.push({
      name,
      cat: category,
      ph: 'i',
      ts,
      pid: this.pid,
      tid: 0,
      s: scope,
      args,
    });
  }

  /**
   * Counter event (memory, CPU, etc)
   */
  counter(name: string, value: number, category: string = 'system'): void {
    if (!this.enabled) {return;}

    const now = performance.now();
    const ts = this.timeToMicroseconds(now);

    this.events.push({
      name,
      cat: category,
      ph: 'C',
      ts,
      pid: this.pid,
      tid: 0,
      args: {
        value,
      },
    });
  }

  /**
   * Convert performance.now() to microseconds
   */
  private timeToMicroseconds(time: number): number {
    return Math.floor(time * 1000);
  }

  /**
   * Export to Chrome Tracing format
   */
  toJSON(): ChromeTraceFormat {
    return {
      traceEvents: this.events,
      displayTimeUnit: 'ms',
      metadata: {
        product: 'kb-labs',
        'os-name': process.platform,
        'num-cpus': os.cpus().length,
        'physical-memory': os.totalmem(),
      },
    };
  }

  /**
   * Export to file
   */
  async export(filePath?: string): Promise<string> {
    if (!this.enabled) {
      return '<disabled>';
    }

    const outputPath = filePath || this.generateFilePath();

    // Ensure directory exists
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Write trace file
    const json = JSON.stringify(this.toJSON(), null, 2);
    await fs.promises.writeFile(outputPath, json, 'utf8');

    return outputPath;
  }

  /**
   * Generate file path
   */
  private generateFilePath(): string {
    const fileName = this.filePattern
      .replace('{pid}', String(this.pid))
      .replace('{timestamp}', String(Date.now()));

    return path.join(this.traceDir, fileName);
  }

  /**
   * Get event count
   */
  getEventCount(): number {
    return this.events.length;
  }

  /**
   * Clear all events
   */
  clear(): void {
    this.events = [];
    this.activeSpans.clear();
  }
}

/**
 * Create TraceRecorder with defaults
 */
export function createTraceRecorder(options?: Partial<TraceRecorderOptions>): TraceRecorder {
  return new TraceRecorder(options);
}

/**
 * Helper: measure function execution
 */
export async function measureAsync<T>(
  recorder: TraceRecorder,
  name: string,
  category: string,
  fn: () => Promise<T>,
  args?: Record<string, any>
): Promise<T> {
  const start = performance.now();
  recorder.begin(name, category, args);

  try {
    return await fn();
  } finally {
    recorder.end(name);
  }
}

/**
 * Helper: measure sync function execution
 */
export function measureSync<T>(
  recorder: TraceRecorder,
  name: string,
  category: string,
  fn: () => T,
  args?: Record<string, any>
): T {
  const start = performance.now();
  recorder.begin(name, category, args);

  try {
    return fn();
  } finally {
    recorder.end(name);
  }
}
