import type { DebugEntry } from '../types';
import { formatTimelineWithSummary } from '../formatters/timeline';
import { DebugTree } from './tree';

export interface TraceOptions {
  showSummary?: boolean;
  groupByPlugin?: boolean;
  maxDepth?: number;
}

export class DebugTrace {
  private readonly entries: DebugEntry[] = [];
  private readonly options: TraceOptions;

  constructor(entries: DebugEntry[] = [], options: TraceOptions = {}) {
    this.entries.push(...entries);
    this.options = options;
  }

  add(entry: DebugEntry): void {
    this.entries.push(entry);
  }

  addAll(entries: DebugEntry[]): void {
    this.entries.push(...entries);
  }

  clear(): void {
    this.entries.length = 0;
  }

  format(): string {
    if (this.entries.length === 0) {
      return '';
    }

    const sorted = [...this.entries].sort((a, b) => a.timestamp - b.timestamp);
    if (this.options.groupByPlugin) {
      return this.formatGrouped(sorted);
    }

    return formatTimelineWithSummary(sorted);
  }

  private formatGrouped(entries: DebugEntry[]): string {
    const groups = new Map<string, DebugEntry[]>();
    for (const entry of entries) {
      const plugin = entry.namespace.split(':')[0] ?? entry.namespace;
      if (!groups.has(plugin)) {
        groups.set(plugin, []);
      }
      groups.get(plugin)!.push(entry);
    }

    const parts: string[] = [];
    for (const [plugin, pluginEntries] of groups) {
      const tree = new DebugTree(pluginEntries, {
        showSummary: this.options.showSummary,
        maxDepth: this.options.maxDepth,
      });
      const formatted = tree.format();
      if (formatted) {
        parts.push(`[${plugin}]`, formatted);
      }
    }
    return parts.join('\n\n');
  }

  getStats(): {
    totalEntries: number;
    plugins: string[];
    totalDuration: number;
    errorCount: number;
    warnCount: number;
  } {
    const plugins = new Set<string>();
    let totalDuration = 0;
    let errorCount = 0;
    let warnCount = 0;

    for (const entry of this.entries) {
      const plugin = entry.namespace.split(':')[0] ?? entry.namespace;
      plugins.add(plugin);
      totalDuration += entry.duration ?? 0;
      if (entry.level === 'error') {
        errorCount += 1;
      } else if (entry.level === 'warn') {
        warnCount += 1;
      }
    }

    return {
      totalEntries: this.entries.length,
      plugins: Array.from(plugins),
      totalDuration,
      errorCount,
      warnCount,
    };
  }
}

