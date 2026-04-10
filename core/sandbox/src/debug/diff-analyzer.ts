/**
 * @module @kb-labs/core-sandbox/debug/diff-analyzer
 * Compare execution snapshots to identify differences
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

/**
 * Snapshot data structure (matches @kb-labs/plugin-runtime/snapshot)
 */
interface SnapshotData {
  id: string;
  timestamp: string;
  command: string;
  pluginId: string;
  pluginVersion: string;
  input: Record<string, unknown>;
  context: {
    cwd: string;
    workdir: string;
    outdir?: string;
    user?: string;
  };
  env: Record<string, string>;
  result: 'success' | 'error';
  error?: {
    code: string;
    message: string;
    stack?: string;
    details?: Record<string, unknown>;
  };
  logs?: string[];
  metrics?: {
    timeMs: number;
    cpuMs?: number;
    memMb?: number;
  };
}

/**
 * Execution diff result
 */
export interface ExecutionDiff {
  contextDiff: {
    added: Record<string, unknown>;
    removed: Record<string, unknown>;
    changed: Array<{ key: string; before: unknown; after: unknown }>;
  };
  performanceDiff: {
    durationDelta: number; // ms
    memoryDelta: number; // MB
    operationCountDelta: { fs: number; net: number; invoke: number };
  };
  logDiff: {
    newErrors: string[];
    newWarnings: string[];
    missingLogs: string[];
  };
  insights: Array<{
    category: 'performance' | 'context' | 'behavior';
    message: string;
    severity: 'info' | 'warning' | 'critical';
  }>;
}

/**
 * Load snapshot from file
 */
async function loadSnapshot(filePath: string): Promise<SnapshotData | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as SnapshotData;
  } catch {
    return null;
  }
}

/**
 * Compare two context objects
 */
function compareContexts(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): ExecutionDiff['contextDiff'] {
  const added: Record<string, unknown> = {};
  const removed: Record<string, unknown> = {};
  const changed: Array<{ key: string; before: unknown; after: unknown }> = [];

  const beforeKeys = new Set(Object.keys(before));
  const afterKeys = new Set(Object.keys(after));

  // Find added keys
  for (const key of afterKeys) {
    if (!beforeKeys.has(key)) {
      added[key] = after[key];
    }
  }

  // Find removed keys
  for (const key of beforeKeys) {
    if (!afterKeys.has(key)) {
      removed[key] = before[key];
    }
  }

  // Find changed keys
  for (const key of beforeKeys) {
    if (afterKeys.has(key)) {
      const beforeValue = before[key];
      const afterValue = after[key];
      if (JSON.stringify(beforeValue) !== JSON.stringify(afterValue)) {
        changed.push({ key, before: beforeValue, after: afterValue });
      }
    }
  }

  return { added, removed, changed };
}

/**
 * Compare performance metrics
 */
function comparePerformance(
  before: SnapshotData['metrics'],
  after: SnapshotData['metrics']
): ExecutionDiff['performanceDiff'] {
  const beforeMetrics = before || { timeMs: 0, memMb: 0 };
  const afterMetrics = after || { timeMs: 0, memMb: 0 };

  return {
    durationDelta: afterMetrics.timeMs - beforeMetrics.timeMs,
    memoryDelta: (afterMetrics.memMb || 0) - (beforeMetrics.memMb || 0),
    operationCountDelta: {
      fs: 0, // Will be populated from profile if available
      net: 0,
      invoke: 0,
    },
  };
}

/**
 * Compare logs
 */
function compareLogs(
  before: string[] = [],
  after: string[] = []
): ExecutionDiff['logDiff'] {
  const beforeSet = new Set(before);
  const afterSet = new Set(after);

  const newErrors: string[] = [];
  const newWarnings: string[] = [];
  const missingLogs: string[] = [];

  // Find new errors and warnings
  for (const log of after) {
    if (!beforeSet.has(log)) {
      const lowerLog = log.toLowerCase();
      if (lowerLog.includes('error') || lowerLog.includes('✗') || lowerLog.includes('failed')) {
        newErrors.push(log);
      } else if (lowerLog.includes('warn') || lowerLog.includes('⚠')) {
        newWarnings.push(log);
      }
    }
  }

  // Find missing logs (present in before but not in after)
  for (const log of before) {
    if (!afterSet.has(log)) {
      missingLogs.push(log);
    }
  }

  return { newErrors, newWarnings, missingLogs };
}

/**
 * Generate insights from diff
 */
function generateInsights(diff: ExecutionDiff): ExecutionDiff['insights'] {
  const insights: ExecutionDiff['insights'] = [];

  // Performance insights
  if (diff.performanceDiff.durationDelta > 1000) {
    insights.push({
      category: 'performance',
      message: `Execution time increased by ${diff.performanceDiff.durationDelta}ms`,
      severity: diff.performanceDiff.durationDelta > 5000 ? 'critical' : 'warning',
    });
  } else if (diff.performanceDiff.durationDelta < -1000) {
    insights.push({
      category: 'performance',
      message: `Execution time decreased by ${Math.abs(diff.performanceDiff.durationDelta)}ms`,
      severity: 'info',
    });
  }

  if (diff.performanceDiff.memoryDelta > 50) {
    insights.push({
      category: 'performance',
      message: `Memory usage increased by ${diff.performanceDiff.memoryDelta}MB`,
      severity: diff.performanceDiff.memoryDelta > 200 ? 'critical' : 'warning',
    });
  }

  // Context insights
  if (diff.contextDiff.changed.length > 0) {
    insights.push({
      category: 'context',
      message: `${diff.contextDiff.changed.length} context properties changed`,
      severity: diff.contextDiff.changed.length > 5 ? 'warning' : 'info',
    });
  }

  if (Object.keys(diff.contextDiff.added).length > 0) {
    insights.push({
      category: 'context',
      message: `${Object.keys(diff.contextDiff.added).length} new context properties added`,
      severity: 'info',
    });
  }

  // Behavior insights
  if (diff.logDiff.newErrors.length > 0) {
    insights.push({
      category: 'behavior',
      message: `${diff.logDiff.newErrors.length} new error(s) appeared`,
      severity: diff.logDiff.newErrors.length > 3 ? 'critical' : 'warning',
    });
  }

  if (diff.logDiff.newWarnings.length > 0) {
    insights.push({
      category: 'behavior',
      message: `${diff.logDiff.newWarnings.length} new warning(s) appeared`,
      severity: 'info',
    });
  }

  return insights;
}

/**
 * Compare two execution snapshots
 */
export async function compareSnapshots(
  beforePath: string,
  afterPath: string
): Promise<ExecutionDiff | null> {
  const before = await loadSnapshot(beforePath);
  const after = await loadSnapshot(afterPath);

  if (!before || !after) {
    return null;
  }

  // Compare contexts
  const contextDiff = compareContexts(
    before.context as Record<string, unknown>,
    after.context as Record<string, unknown>
  );

  // Compare performance
  const performanceDiff = comparePerformance(before.metrics, after.metrics);

  // Compare logs
  const logDiff = compareLogs(before.logs, after.logs);

  const diff: ExecutionDiff = {
    contextDiff,
    performanceDiff,
    logDiff,
    insights: [],
  };

  // Generate insights
  diff.insights = generateInsights(diff);

  return diff;
}

/**
 * Find latest success and error snapshots
 */
export async function findLatestSnapshots(
  snapshotsDir: string,
  pluginId?: string
): Promise<{ success: SnapshotData | null; error: SnapshotData | null }> {
  try {
    const files = await fs.readdir(snapshotsDir);
    const snapshotFiles = files
      .filter((f) => f.endsWith('.json'))
      .sort()
      .reverse();

    let success: SnapshotData | null = null;
    let error: SnapshotData | null = null;

    for (const file of snapshotFiles) {
      const snapshot = await loadSnapshot(path.join(snapshotsDir, file));
      if (!snapshot) {continue;}
      if (pluginId && snapshot.pluginId !== pluginId) {continue;}

      if (!success && snapshot.result === 'success') {
        success = snapshot;
      }
      if (!error && snapshot.result === 'error') {
        error = snapshot;
      }

      if (success && error) {break;}
    }

    return { success, error };
  } catch {
    return { success: null, error: null };
  }
}

/**
 * Format diff for display
 */
export function formatDiff(diff: ExecutionDiff): string {
  const lines: string[] = [];

  lines.push('📊 Execution Diff Analysis\n');

  // Performance diff
  if (diff.performanceDiff.durationDelta !== 0 || diff.performanceDiff.memoryDelta !== 0) {
    lines.push('Performance Changes:');
    if (diff.performanceDiff.durationDelta !== 0) {
      const sign = diff.performanceDiff.durationDelta > 0 ? '+' : '';
      lines.push(`  Duration: ${sign}${diff.performanceDiff.durationDelta}ms`);
    }
    if (diff.performanceDiff.memoryDelta !== 0) {
      const sign = diff.performanceDiff.memoryDelta > 0 ? '+' : '';
      lines.push(`  Memory: ${sign}${diff.performanceDiff.memoryDelta}MB`);
    }
    lines.push('');
  }

  // Context diff
  if (
    Object.keys(diff.contextDiff.added).length > 0 ||
    Object.keys(diff.contextDiff.removed).length > 0 ||
    diff.contextDiff.changed.length > 0
  ) {
    lines.push('Context Changes:');
    if (Object.keys(diff.contextDiff.added).length > 0) {
      lines.push(`  Added: ${Object.keys(diff.contextDiff.added).join(', ')}`);
    }
    if (Object.keys(diff.contextDiff.removed).length > 0) {
      lines.push(`  Removed: ${Object.keys(diff.contextDiff.removed).join(', ')}`);
    }
    if (diff.contextDiff.changed.length > 0) {
      lines.push(`  Changed: ${diff.contextDiff.changed.length} properties`);
      for (const change of diff.contextDiff.changed.slice(0, 5)) {
        lines.push(`    - ${change.key}: ${JSON.stringify(change.before)} → ${JSON.stringify(change.after)}`);
      }
    }
    lines.push('');
  }

  // Log diff
  if (
    diff.logDiff.newErrors.length > 0 ||
    diff.logDiff.newWarnings.length > 0 ||
    diff.logDiff.missingLogs.length > 0
  ) {
    lines.push('Log Changes:');
    if (diff.logDiff.newErrors.length > 0) {
      lines.push(`  New Errors: ${diff.logDiff.newErrors.length}`);
      for (const error of diff.logDiff.newErrors.slice(0, 3)) {
        lines.push(`    - ${error.substring(0, 100)}${error.length > 100 ? '...' : ''}`);
      }
    }
    if (diff.logDiff.newWarnings.length > 0) {
      lines.push(`  New Warnings: ${diff.logDiff.newWarnings.length}`);
    }
    if (diff.logDiff.missingLogs.length > 0) {
      lines.push(`  Missing Logs: ${diff.logDiff.missingLogs.length}`);
    }
    lines.push('');
  }

  // Insights
  if (diff.insights.length > 0) {
    lines.push('Insights:');
    for (const insight of diff.insights) {
      const emoji = {
        critical: '🔴',
        warning: '🟡',
        info: '🔵',
      }[insight.severity];
      lines.push(`  ${emoji} [${insight.severity.toUpperCase()}] ${insight.message}`);
    }
  }

  return lines.join('\n');
}

