/**
 * @module @kb-labs/core-sandbox/debug/time-travel
 * Time travel debugging with breakpoints and inspection
 */

import * as fs from 'node:fs/promises';
import type { DebugLogEntry } from './logger';

/**
 * Snapshot data structure (matches @kb-labs/plugin-runtime/snapshot)
 */
interface SnapshotData {
  id: string;
  timestamp: string;
  command: string;
  pluginId: string;
  pluginVersion: string;
  context: {
    cwd: string;
    workdir: string;
    outdir?: string;
    user?: string;
  };
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
 * Time travel session snapshot
 */
export interface TimeTravelSnapshot {
  id: string;
  timestamp: number;
  phase: string;
  context: Record<string, unknown>; // Simplified context snapshot
  logs: DebugLogEntry[];
  memory: number;
  operations: number;
}

/**
 * Time travel session
 */
export interface TimeTravelSession {
  snapshots: TimeTravelSnapshot[];
  currentIndex: number;
  breakpoints: Set<string>; // phase names
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
 * Create time travel session from snapshot
 */
export async function createTimeTravelSession(
  snapshotPath: string
): Promise<TimeTravelSession | null> {
  const snapshot = await loadSnapshot(snapshotPath);
  if (!snapshot) {
    return null;
  }

  // Convert snapshot to time travel snapshots
  // For now, we create a single snapshot representing the entire execution
  // In the future, this could be enhanced to parse phase-by-phase snapshots
  const timeTravelSnapshot: TimeTravelSnapshot = {
    id: snapshot.id,
    timestamp: new Date(snapshot.timestamp).getTime(),
    phase: 'complete',
    context: {
      pluginId: snapshot.pluginId,
      pluginVersion: snapshot.pluginVersion,
      command: snapshot.command,
      workdir: snapshot.context.workdir,
      cwd: snapshot.context.cwd,
      result: snapshot.result,
    },
    logs: (snapshot.logs || []).map((log, idx) => ({
      timestamp: new Date(snapshot.timestamp).getTime() + idx,
      namespace: snapshot.pluginId,
      level: detectLogLevel(log),
      message: log,
      meta: {},
    })),
    memory: snapshot.metrics?.memMb || 0,
    operations: 0, // Could be calculated from profile if available
  };

  return {
    snapshots: [timeTravelSnapshot],
    currentIndex: 0,
    breakpoints: new Set(),
  };
}

/**
 * Detect log level from log message
 */
function detectLogLevel(log: string): DebugLogEntry['level'] {
  const lowerLog = log.toLowerCase();
  if (lowerLog.includes('error') || lowerLog.includes('✗') || lowerLog.includes('failed')) {
    return 'error';
  }
  if (lowerLog.includes('warn') || lowerLog.includes('⚠')) {
    return 'warn';
  }
  if (lowerLog.includes('debug')) {
    return 'debug';
  }
  return 'info';
}

/**
 * Step to next snapshot in session
 */
export function stepForward(session: TimeTravelSession): boolean {
  if (session.currentIndex < session.snapshots.length - 1) {
    session.currentIndex++;
    return true;
  }
  return false;
}

/**
 * Step to previous snapshot in session
 */
export function stepBackward(session: TimeTravelSession): boolean {
  if (session.currentIndex > 0) {
    session.currentIndex--;
    return true;
  }
  return false;
}

/**
 * Jump to specific snapshot index
 */
export function jumpToSnapshot(session: TimeTravelSession, index: number): boolean {
  if (index >= 0 && index < session.snapshots.length) {
    session.currentIndex = index;
    return true;
  }
  return false;
}

/**
 * Jump to phase
 */
export function jumpToPhase(session: TimeTravelSession, phase: string): boolean {
  const index = session.snapshots.findIndex((s) => s.phase === phase);
  if (index !== -1) {
    session.currentIndex = index;
    return true;
  }
  return false;
}

/**
 * Add breakpoint
 */
export function addBreakpoint(session: TimeTravelSession, phase: string): void {
  session.breakpoints.add(phase);
}

/**
 * Remove breakpoint
 */
export function removeBreakpoint(session: TimeTravelSession, phase: string): void {
  session.breakpoints.delete(phase);
}

/**
 * Check if current snapshot hits a breakpoint
 */
export function checkBreakpoint(session: TimeTravelSession): boolean {
  const current = session.snapshots[session.currentIndex];
  return current ? session.breakpoints.has(current.phase) : false;
}

/**
 * Get current snapshot
 */
export function getCurrentSnapshot(session: TimeTravelSession): TimeTravelSnapshot | null {
  return session.snapshots[session.currentIndex] || null;
}

/**
 * Inspect context at current snapshot
 */
export function inspectContext(session: TimeTravelSession): Record<string, unknown> {
  const current = getCurrentSnapshot(session);
  return current ? current.context : {};
}

/**
 * Get logs for current snapshot
 */
export function getCurrentLogs(session: TimeTravelSession): DebugLogEntry[] {
  const current = getCurrentSnapshot(session);
  return current ? current.logs : [];
}

/**
 * Format time travel session status
 */
export function formatSessionStatus(session: TimeTravelSession): string {
  const current = getCurrentSnapshot(session);
  if (!current) {
    return 'No snapshot available';
  }

  const lines: string[] = [];
  lines.push(`Time Travel Session: ${session.snapshots.length} snapshot(s)`);
  lines.push(`Current: ${session.currentIndex + 1}/${session.snapshots.length}`);
  lines.push(`Phase: ${current.phase}`);
  lines.push(`Timestamp: ${new Date(current.timestamp).toISOString()}`);
  lines.push(`Memory: ${current.memory}MB`);
  lines.push(`Logs: ${current.logs.length} entries`);

  if (session.breakpoints.size > 0) {
    lines.push(`Breakpoints: ${Array.from(session.breakpoints).join(', ')}`);
  }

  return lines.join('\n');
}

