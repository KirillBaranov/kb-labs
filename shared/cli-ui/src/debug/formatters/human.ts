import { safeColors, safeSymbols } from '../../colors';
import type { DebugEntry } from '../types';

export interface HumanFormatterOptions {
  showTimestamp?: boolean;
  showDuration?: boolean;
  groupBy?: 'namespace' | 'group' | 'none';
}

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toISOString();
}

function formatDuration(duration: number): string {
  if (duration < 1000) {
    return `${duration}ms`;
  }
  return `${(duration / 1000).toFixed(2)}s`;
}

export function formatDebugEntryHuman(entry: DebugEntry, options: HumanFormatterOptions = {}): string {
  const parts: string[] = [];

  if (options.showTimestamp) {
    parts.push(safeColors.dim(formatTimestamp(entry.timestamp)));
  }

  parts.push(safeColors.bold(`[${entry.namespace}]`));
  parts.push(entry.message);

  if (options.showDuration && typeof entry.duration === 'number') {
    parts.push(safeColors.dim(`(${formatDuration(entry.duration)})`));
  }

  if (entry.level === 'error') {
    parts.push(safeColors.error(safeSymbols.error));
  } else if (entry.level === 'warn') {
    parts.push(safeColors.warning(safeSymbols.warning));
  }

  return parts.join(' ');
}

export function formatDebugEntriesHuman(entries: DebugEntry[], options: HumanFormatterOptions = {}): string {
  if (entries.length === 0) {
    return '';
  }

  const sorted = [...entries].sort((a, b) => a.timestamp - b.timestamp);
  const lines: string[] = [];

  if (options.groupBy === 'namespace') {
    const namespaces = new Map<string, DebugEntry[]>();
    for (const entry of sorted) {
      if (!namespaces.has(entry.namespace)) {
        namespaces.set(entry.namespace, []);
      }
      namespaces.get(entry.namespace)!.push(entry);
    }

    for (const [namespace, namespaceEntries] of namespaces) {
      lines.push(safeColors.bold(namespace));
      for (const entry of namespaceEntries) {
        lines.push(`  ${formatDebugEntryHuman(entry, options)}`);
      }
      lines.push('');
    }
    return lines.join('\n').trimEnd();
  }

  if (options.groupBy === 'group') {
    const groups = new Map<string, DebugEntry[]>();
    for (const entry of sorted) {
      const groupName = entry.group ?? 'default';
      if (!groups.has(groupName)) {
        groups.set(groupName, []);
      }
      groups.get(groupName)!.push(entry);
    }

    for (const [groupName, groupEntries] of groups) {
      lines.push(safeColors.bold(groupName));
      for (const entry of groupEntries) {
        lines.push(`  ${formatDebugEntryHuman(entry, options)}`);
      }
      lines.push('');
    }
    return lines.join('\n').trimEnd();
  }

  for (const entry of sorted) {
    lines.push(formatDebugEntryHuman(entry, options));
  }

  return lines.join('\n');
}

