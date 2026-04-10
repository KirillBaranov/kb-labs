/**
 * @module @kb-labs/core-sandbox/monitoring/profiler
 * Performance profiler for detailed execution analysis
 */

import type { ExecutionContext } from '../types/index';

export interface ProfilePhase {
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  operations: Array<{
    type: 'fs' | 'net' | 'env' | 'invoke' | 'other';
    name: string;
    duration: number;
    details?: Record<string, unknown>;
  }>;
}

export interface ProfileData {
  id: string;
  pluginId?: string;
  command?: string;
  startTime: number;
  endTime: number;
  totalDuration: number;
  phases: ProfilePhase[];
  memory: {
    initial: number;
    peak: number;
    final: number;
  };
  operations: {
    fs: { reads: number; writes: number; total: number };
    net: { requests: number; total: number };
    env: { accesses: number };
    invoke: { calls: number; total: number };
  };
}

export class Profiler {
  private ctx: ExecutionContext;
  private pluginId?: string;
  private command?: string;
  private startTime: number;
  private phases: Map<string, ProfilePhase>;
  private currentPhase: string | null;
  private operations: ProfilePhase['operations'];
  private memoryInitial: number;
  private memoryPeak: number;
  private operationCounts: ProfileData['operations'];

  constructor(ctx: ExecutionContext, pluginId?: string, command?: string) {
    this.ctx = ctx;
    this.pluginId = pluginId || (ctx as any).pluginId;
    this.command = command || (ctx as any).routeOrCommand;
    this.startTime = Date.now();
    this.phases = new Map();
    this.currentPhase = null;
    this.operations = [];
    this.memoryInitial = process.memoryUsage().rss / 1024 / 1024; // MB
    this.memoryPeak = this.memoryInitial;
    this.operationCounts = {
      fs: { reads: 0, writes: 0, total: 0 },
      net: { requests: 0, total: 0 },
      env: { accesses: 0 },
      invoke: { calls: 0, total: 0 },
    };
  }

  startPhase(name: string): void {
    const now = Date.now();
    
    // End current phase if exists
    if (this.currentPhase) {
      this.endPhase(this.currentPhase);
    }

    this.phases.set(name, {
      name,
      startTime: now,
      operations: [],
    });
    this.currentPhase = name;
  }

  endPhase(name: string): void {
    const phase = this.phases.get(name);
    if (!phase) {return;}

    const now = Date.now();
    phase.endTime = now;
    phase.duration = now - phase.startTime;
    phase.operations = [...this.operations];
    this.operations = [];
    
    if (this.currentPhase === name) {
      this.currentPhase = null;
    }
  }

  recordOperation(
    type: ProfilePhase['operations'][0]['type'],
    name: string,
    duration: number,
    details?: Record<string, unknown>
  ): void {
    this.operations.push({
      type,
      name,
      duration,
      details,
    });

    // Update operation counts
    if (type === 'fs') {
      if (name.includes('read') || name.includes('Read')) {
        this.operationCounts.fs.reads++;
      } else if (name.includes('write') || name.includes('Write')) {
        this.operationCounts.fs.writes++;
      }
      this.operationCounts.fs.total++;
    } else if (type === 'net') {
      this.operationCounts.net.requests++;
      this.operationCounts.net.total++;
    } else if (type === 'env') {
      this.operationCounts.env.accesses++;
    } else if (type === 'invoke') {
      this.operationCounts.invoke.calls++;
      this.operationCounts.invoke.total++;
    }

    // Update peak memory
    const currentMemory = process.memoryUsage().rss / 1024 / 1024; // MB
    if (currentMemory > this.memoryPeak) {
      this.memoryPeak = currentMemory;
    }
  }

  stop(): ProfileData {
    const endTime = Date.now();
    
    // End current phase if exists
    if (this.currentPhase) {
      this.endPhase(this.currentPhase);
    }

    const finalMemory = process.memoryUsage().rss / 1024 / 1024; // MB

    return {
      id: this.ctx.requestId || `profile-${Date.now()}`,
      pluginId: this.pluginId || (this.ctx as any).pluginId || 'unknown',
      command: this.command || (this.ctx as any).routeOrCommand || 'unknown',
      startTime: this.startTime,
      endTime,
      totalDuration: endTime - this.startTime,
      phases: Array.from(this.phases.values()),
      memory: {
        initial: this.memoryInitial,
        peak: this.memoryPeak,
        final: finalMemory,
      },
      operations: this.operationCounts,
    };
  }
}

/**
 * Format timeline as ASCII visualization
 */
export function formatTimeline(data: ProfileData): string {
  const totalMs = data.totalDuration;
  const barWidth = 40;

  let output = `⏱ Performance Profile for ${data.pluginId}:${data.command}\n\n`;
  output += `Timeline:\n`;

  for (const phase of data.phases) {
    const duration = phase.duration || 0;
    const percentage = totalMs > 0 ? (duration / totalMs) * 100 : 0;
    const barLength = Math.floor((percentage / 100) * barWidth);
    const bar = '█'.repeat(barLength) + '░'.repeat(barWidth - barLength);

    output += `├─ ${phase.name.padEnd(20)} [${bar}] ${duration}ms   (${percentage.toFixed(1)}%)\n`;

    // Show operations breakdown if available
    if (phase.operations.length > 0) {
      const fsOps = phase.operations.filter(op => op.type === 'fs');
      const netOps = phase.operations.filter(op => op.type === 'net');
      
      if (fsOps.length > 0) {
        const fsTime = fsOps.reduce((sum, op) => sum + op.duration, 0);
        output += `│  ├─ FS operations     [${'█'.repeat(Math.floor((fsTime / duration) * barWidth))}${'░'.repeat(barWidth - Math.floor((fsTime / duration) * barWidth))}] ${fsTime}ms (${fsOps.length} ops)\n`;
      }
      
      if (netOps.length > 0) {
        const netTime = netOps.reduce((sum, op) => sum + op.duration, 0);
        output += `│  └─ Network requests [${'█'.repeat(Math.floor((netTime / duration) * barWidth))}${'░'.repeat(barWidth - Math.floor((netTime / duration) * barWidth))}] ${netTime}ms (${netOps.length} reqs)\n`;
      }
    }
  }

  output += `\n`;
  output += `Total: ${totalMs}ms | Memory: +${(data.memory.final - data.memory.initial).toFixed(1)} MB | Peak: ${data.memory.peak.toFixed(1)} MB\n`;
  
  if (data.operations.fs.total > 0) {
    output += `FS: ${data.operations.fs.reads} reads, ${data.operations.fs.writes} writes\n`;
  }
  if (data.operations.net.total > 0) {
    output += `Network: ${data.operations.net.requests} requests\n`;
  }

  return output;
}

/**
 * Re-export flame graph functions
 */
export {
  profileToFlameGraph,
  exportFlameGraphHTML,
  checkPerformanceBudget,
  formatBudgetViolations,
  createDefaultBudget,
  type FlameGraphNode,
  type PerformanceBudget,
  type BudgetViolation,
} from './flame-graph';

/**
 * Export profile data to Chrome DevTools format
 */
export function exportChromeFormat(data: ProfileData): object {
  const events: Array<{
    name: string;
    ph: 'B' | 'E' | 'X';
    ts: number;
    pid: number;
    tid: number;
    args?: Record<string, unknown>;
  }> = [];

  const eventId = 0;
  const pid = 1;
  const tid = 1;

  // Add phase events
  for (const phase of data.phases) {
    const startTs = phase.startTime * 1000; // microseconds
    const endTs = (phase.endTime || phase.startTime) * 1000;

    events.push({
      name: phase.name,
      ph: 'B',
      ts: startTs,
      pid,
      tid,
      args: {},
    });

    events.push({
      name: phase.name,
      ph: 'E',
      ts: endTs,
      pid,
      tid,
      args: {
        duration: phase.duration,
      },
    });
  }

  // Add operation events
  for (const phase of data.phases) {
    for (const op of phase.operations) {
      const startTs = (phase.startTime + op.duration / 2) * 1000;
      events.push({
        name: `${op.type}:${op.name}`,
        ph: 'X',
        ts: startTs,
        pid,
        tid,
        args: {
          duration: op.duration,
          ...op.details,
        },
      });
    }
  }

  return {
    traceEvents: events.sort((a, b) => a.ts - b.ts),
    metadata: {
      name: `${data.pluginId}:${data.command}`,
      totalDuration: data.totalDuration,
      memory: data.memory,
      operations: data.operations,
    },
  };
}

