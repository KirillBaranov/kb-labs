import { formatDebugEntriesHuman } from './formatters/human';
import { formatDebugEntriesAI } from './formatters/ai';
import { formatTimelineWithSummary } from './formatters/timeline';
import type { DebugEntry, DebugExportOptions, DebugFilterOptions, DebugTreeNode } from './types';

function toRegex(pattern: string): RegExp {
  if (!pattern.includes('*')) {
    return new RegExp(`^${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
  }
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`, 'i');
}

export function filterByNamespace(entries: DebugEntry[], pattern: string | RegExp): DebugEntry[] {
  const matcher = typeof pattern === 'string' ? toRegex(pattern) : pattern;
  return entries.filter((entry) => matcher.test(entry.namespace));
}

export function filterByLevel(entries: DebugEntry[], level: string | string[]): DebugEntry[] {
  const allowed = Array.isArray(level) ? new Set(level) : new Set([level]);
  return entries.filter((entry) => allowed.has(entry.level));
}

export function filterByTimeRange(entries: DebugEntry[], from?: number, to?: number): DebugEntry[] {
  return entries.filter((entry) => {
    if (from !== undefined && entry.timestamp < from) {
      return false;
    }
    if (to !== undefined && entry.timestamp > to) {
      return false;
    }
    return true;
  });
}

export function searchInLogs(entries: DebugEntry[], query: string): DebugEntry[] {
  const lowered = query.toLowerCase();
  return entries.filter((entry) => {
    if (entry.message.toLowerCase().includes(lowered)) {
      return true;
    }
    if (entry.namespace.toLowerCase().includes(lowered)) {
      return true;
    }
    if (entry.meta) {
      const metaString = JSON.stringify(entry.meta).toLowerCase();
      if (metaString.includes(lowered)) {
        return true;
      }
    }
    return false;
  });
}

export function filterDebugEntries(entries: DebugEntry[], options: DebugFilterOptions): DebugEntry[] {
  let filtered = [...entries];

  if (options.namespace) {
    filtered = filterByNamespace(filtered, options.namespace);
  }

  if (options.level) {
    filtered = filterByLevel(filtered, options.level);
  }

  if (options.timeRange) {
    filtered = filterByTimeRange(filtered, options.timeRange.from, options.timeRange.to);
  }

  if (options.search) {
    filtered = searchInLogs(filtered, options.search);
  }

  if (options.traceId) {
    filtered = filtered.filter((entry) => entry.traceId === options.traceId);
  }

  return filtered;
}

export function groupByNamespace(entries: DebugEntry[]): Map<string, DebugEntry[]> {
  const map = new Map<string, DebugEntry[]>();
  for (const entry of entries) {
    if (!map.has(entry.namespace)) {
      map.set(entry.namespace, []);
    }
    map.get(entry.namespace)!.push(entry);
  }
  return map;
}

export function groupByGroup(entries: DebugEntry[]): Map<string, DebugEntry[]> {
  const map = new Map<string, DebugEntry[]>();
  for (const entry of entries) {
    const group = entry.group ?? 'default';
    if (!map.has(group)) {
      map.set(group, []);
    }
    map.get(group)!.push(entry);
  }
  return map;
}

export function createDebugTree(entries: DebugEntry[]): DebugTreeNode | null {
  if (entries.length === 0) {
    return null;
  }

  const sorted = [...entries].sort((a, b) => a.timestamp - b.timestamp);
  const nodes = new Map<string, DebugTreeNode>();
  let root: DebugTreeNode | null = null;

  function ensureNode(entry: DebugEntry): DebugTreeNode {
    if (entry.spanId && nodes.has(entry.spanId)) {
      return nodes.get(entry.spanId)!;
    }
    const node: DebugTreeNode = { entry, children: [], depth: 0 };
    if (entry.spanId) {
      nodes.set(entry.spanId, node);
    }
    return node;
  }

  for (const entry of sorted) {
    const node = ensureNode(entry);

    if (entry.parentSpanId && nodes.has(entry.parentSpanId)) {
      const parent = nodes.get(entry.parentSpanId)!;
      node.depth = parent.depth + 1;
      parent.children.push(node);
    } else if (root === null) {
      root = node;
    } else {
      // Fallback: attach additional roots under primary root to preserve output
      node.depth = root.depth + 1;
      root.children.push(node);
    }
  }

  return root;
}

export function exportToJSON(entries: DebugEntry[], options: DebugExportOptions = {}): string {
  const filtered = options.filter ? filterDebugEntries(entries, options.filter) : entries;
  if (options.includeMeta === false) {
    return JSON.stringify(
      filtered.map(({ meta, ...rest }) => rest),
      null,
      2,
    );
  }
  return JSON.stringify(filtered, null, 2);
}

export function exportToChromeFormat(entries: DebugEntry[], options: DebugExportOptions = {}): string {
  const filtered = options.filter ? filterDebugEntries(entries, options.filter) : entries;
  const traceEvents = filtered.map((entry) => ({
    name: entry.message,
    cat: entry.namespace,
    ph: entry.level === 'error' ? 'E' : entry.level === 'warn' ? 'W' : 'X',
    ts: entry.timestamp * 1000,
    dur: (entry.duration ?? 0) * 1000,
    pid: 1,
    tid: entry.spanId ?? entry.namespace,
    args: entry.meta ?? {},
  }));

  return JSON.stringify({ traceEvents }, null, 2);
}

export function exportToPlainText(entries: DebugEntry[], options: DebugExportOptions = {}): string {
  const filtered = options.filter ? filterDebugEntries(entries, options.filter) : entries;
  return formatDebugEntriesHuman(filtered, { groupBy: 'namespace', showTimestamp: true, showDuration: true });
}

export function exportDebugEntries(entries: DebugEntry[], options: DebugExportOptions): string {
  const format = options.format ?? 'json';
  switch (format) {
    case 'chrome':
      return exportToChromeFormat(entries, options);
    case 'text':
      return exportToPlainText(entries, options);
    case 'json':
    default:
      return exportToJSON(entries, options);
  }
}

export function describeEntriesHuman(entries: DebugEntry[], options: DebugFilterOptions = {}): string {
  const filtered = filterDebugEntries(entries, options);
  return formatDebugEntriesHuman(filtered, { showTimestamp: true, showDuration: true, groupBy: 'namespace' });
}

export function describeEntriesAI(entries: DebugEntry[], options: DebugFilterOptions = {}): string {
  const filtered = filterDebugEntries(entries, options);
  return formatDebugEntriesAI(filtered);
}

export function describeEntriesTimeline(entries: DebugEntry[], options: DebugFilterOptions = {}): string {
  const filtered = filterDebugEntries(entries, options);
  return formatTimelineWithSummary(filtered);
}

