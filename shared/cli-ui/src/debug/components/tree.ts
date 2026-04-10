import type { DebugEntry, DebugTreeNode } from '../types';
import { createDebugTree } from '../utilities';
import { formatTimelineNode } from '../formatters/timeline';

export interface DebugTreeOptions {
  showSummary?: boolean;
  maxDepth?: number;
}

interface DebugTreeStats {
  totalDuration: number;
  errorCount: number;
  warnCount: number;
  nodeCount: number;
}

export class DebugTree {
  private tree: DebugTreeNode | null = null;
  private readonly options: DebugTreeOptions;

  constructor(entries: DebugEntry[], options: DebugTreeOptions = {}) {
    this.options = options;
    this.tree = createDebugTree(entries);
  }

  update(entries: DebugEntry[]): void {
    this.tree = createDebugTree(entries);
  }

  format(): string {
    if (!this.tree) {
      return '';
    }

    const lines = formatTimelineNode(this.tree, true, '', this.options.maxDepth);
    if (this.options.showSummary) {
      const summary = this.getSummary();
      if (summary) {
        lines.push('', summary);
      }
    }
    return lines.join('\n');
  }

  private getSummary(): string {
    if (!this.tree) {
      return '';
    }

    const stats = this.collectStats(this.tree);
    const parts: string[] = [];

    if (stats.totalDuration > 0) {
      parts.push(`total ${stats.totalDuration}ms`);
    }
    if (stats.errorCount > 0) {
      parts.push(`${stats.errorCount} errors`);
    }
    if (stats.warnCount > 0) {
      parts.push(`${stats.warnCount} warnings`);
    }
    parts.push(`${stats.nodeCount} nodes`);

    return `Summary: ${parts.join(', ')}`;
  }

  private collectStats(node: DebugTreeNode): DebugTreeStats {
    let totalDuration = node.entry.duration ?? 0;
    let errorCount = node.entry.level === 'error' ? 1 : 0;
    let warnCount = node.entry.level === 'warn' ? 1 : 0;
    let nodeCount = 1;

    for (const child of node.children) {
      const childStats = this.collectStats(child);
      totalDuration += childStats.totalDuration;
      errorCount += childStats.errorCount;
      warnCount += childStats.warnCount;
      nodeCount += childStats.nodeCount;
    }

    return { totalDuration, errorCount, warnCount, nodeCount };
  }

  get root(): DebugTreeNode | null {
    return this.tree;
  }
}

