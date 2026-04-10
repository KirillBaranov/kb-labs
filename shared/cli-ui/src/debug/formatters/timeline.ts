import { safeColors, safeSymbols } from '../../colors';
import type { DebugEntry, DebugTreeNode } from '../types';
import { createDebugTree } from '../utilities';

function formatDuration(duration: number): string {
  if (duration < 1000) {
    return `${duration}ms`;
  }
  return `${(duration / 1000).toFixed(2)}s`;
}

export function formatTimelineNode(
  node: DebugTreeNode,
  isLast: boolean,
  prefix = '',
  maxDepth?: number,
): string[] {
  const lines: string[] = [];
  const connector = isLast ? '└─' : '├─';
  const parts: string[] = [];

  parts.push(safeColors.bold(`[${node.entry.namespace}]`));
  parts.push(node.entry.message);

  if (typeof node.entry.duration === 'number') {
    parts.push(safeColors.dim(`(${formatDuration(node.entry.duration)})`));
  }

  if (node.entry.level === 'error') {
    parts.push(safeColors.error(safeSymbols.error));
  } else if (node.entry.level === 'warn') {
    parts.push(safeColors.warning(safeSymbols.warning));
  }

  lines.push(`${prefix}${connector} ${parts.join(' ')}`.trimEnd());

  if (maxDepth !== undefined && node.depth + 1 >= maxDepth) {
    return lines;
  }

  const childPrefix = prefix + (isLast ? '   ' : '│  ');
  for (let index = 0; index < node.children.length; index++) {
    const child = node.children[index];
    if (!child) {
      continue;
    }
    const childIsLast = index === node.children.length - 1;
    lines.push(...formatTimelineNode(child, childIsLast, childPrefix, maxDepth));
  }

  return lines;
}

export function formatTimeline(entries: DebugEntry[]): string {
  if (entries.length === 0) {
    return '';
  }

  const tree = createDebugTree(entries);
  if (!tree) {
    return '';
  }

  return formatTimelineNode(tree, true).join('\n');
}

export function formatTimelineWithSummary(entries: DebugEntry[]): string {
  const timeline = formatTimeline(entries);
  if (timeline.length === 0) {
    return '';
  }

  const totalDuration = entries.reduce((acc, entry) => acc + (entry.duration ?? 0), 0);
  const errorCount = entries.filter((entry) => entry.level === 'error').length;
  const warnCount = entries.filter((entry) => entry.level === 'warn').length;

  const summaryParts: string[] = [];
  if (totalDuration > 0) {
    summaryParts.push(`Total: ${formatDuration(totalDuration)}`);
  }
  if (errorCount > 0) {
    summaryParts.push(safeColors.error(`${errorCount} errors`));
  }
  if (warnCount > 0) {
    summaryParts.push(safeColors.warning(`${warnCount} warnings`));
  }

  if (summaryParts.length === 0) {
    return timeline;
  }

  return `${timeline}\n\n${safeColors.bold('Summary:')} ${summaryParts.join(', ')}`;
}

