/**
 * @module @kb-labs/core-sandbox/monitoring/flame-graph
 * Flame graph generation for performance analysis
 */

import type { ProfileData, ProfilePhase } from './profiler';

/**
 * Flame graph node
 */
export interface FlameGraphNode {
  name: string;
  value: number; // duration in ms
  children: FlameGraphNode[];
  metadata: {
    type: 'phase' | 'operation' | 'function';
    file?: string;
    line?: number;
  };
}

/**
 * Performance budget
 */
export interface PerformanceBudget {
  totalDuration: number; // ms
  memory: number; // MB
  operations: {
    fs: { reads: number; writes: number };
    net: { requests: number };
  };
}

/**
 * Budget violation
 */
export interface BudgetViolation {
  category: 'duration' | 'memory' | 'operations';
  actual: number;
  budget: number;
  severity: 'warning' | 'error';
  message: string;
}

/**
 * Convert profile data to flame graph structure
 */
export function profileToFlameGraph(profile: ProfileData): FlameGraphNode {
  const root: FlameGraphNode = {
    name: `${profile.pluginId}:${profile.command}`,
    value: profile.totalDuration,
    children: [],
    metadata: {
      type: 'function',
    },
  };

  for (const phase of profile.phases) {
    const phaseNode: FlameGraphNode = {
      name: phase.name,
      value: phase.duration || 0,
      children: [],
      metadata: {
        type: 'phase',
      },
    };

    // Group operations by type
    const operationsByType = new Map<string, ProfilePhase['operations']>();
    for (const op of phase.operations) {
      if (!operationsByType.has(op.type)) {
        operationsByType.set(op.type, []);
      }
      operationsByType.get(op.type)!.push(op);
    }

    // Create operation nodes
    for (const [type, ops] of operationsByType.entries()) {
      const totalOpTime = ops.reduce((sum, op) => sum + op.duration, 0);
      const opNode: FlameGraphNode = {
        name: `${type} operations`,
        value: totalOpTime,
        children: ops.map((op) => ({
          name: op.name,
          value: op.duration,
          children: [],
          metadata: {
            type: 'operation',
            file: op.details?.file as string | undefined,
            line: op.details?.line as number | undefined,
          },
        })),
        metadata: {
          type: 'operation',
        },
      };
      phaseNode.children.push(opNode);
    }

    root.children.push(phaseNode);
  }

  return root;
}

/**
 * Export flame graph to HTML format (compatible with d3-flamegraph)
 */
export function exportFlameGraphHTML(
  flameGraph: FlameGraphNode,
  options: { title?: string; width?: number; height?: number } = {}
): string {
  const title = options.title || 'Performance Flame Graph';
  const width = options.width || 1200;
  const height = options.height || 800;

  // Convert to d3-flamegraph format
  const d3Data = flameGraphToD3Format(flameGraph);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <script src="https://d3js.org/d3.v7.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/d3-flamegraph@4.1.3/dist/d3-flamegraph.min.js"></script>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/d3-flamegraph@4.1.3/dist/d3-flamegraph.css">
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    #chart { margin: 20px 0; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <div id="chart"></div>
  <script>
    const data = ${JSON.stringify(d3Data, null, 2)};
    const flamegraph = d3.flamegraph()
      .width(${width})
      .height(${height})
      .cellHeight(18)
      .transitionDuration(750)
      .transitionEase(d3.easeCubic)
      .label(function(d) {
        return d.data.name + ' (' + d.data.value.toFixed(2) + 'ms)';
      })
      .title(function(d) {
        return d.data.name + ': ' + d.data.value.toFixed(2) + 'ms';
      });
    
    d3.select("#chart")
      .datum(data)
      .call(flamegraph);
  </script>
</body>
</html>`;
}

/**
 * Convert flame graph to d3-flamegraph format
 */
function flameGraphToD3Format(node: FlameGraphNode): any {
  return {
    name: node.name,
    value: node.value,
    children: node.children.map(flameGraphToD3Format),
  };
}

/**
 * Check performance budget
 */
export function checkPerformanceBudget(
  profile: ProfileData,
  budget: PerformanceBudget
): BudgetViolation[] {
  const violations: BudgetViolation[] = [];

  // Check duration
  if (profile.totalDuration > budget.totalDuration) {
    violations.push({
      category: 'duration',
      actual: profile.totalDuration,
      budget: budget.totalDuration,
      severity: profile.totalDuration > budget.totalDuration * 1.5 ? 'error' : 'warning',
      message: `Execution time ${profile.totalDuration}ms exceeds budget ${budget.totalDuration}ms`,
    });
  }

  // Check memory
  if (profile.memory.peak > budget.memory) {
    violations.push({
      category: 'memory',
      actual: profile.memory.peak,
      budget: budget.memory,
      severity: profile.memory.peak > budget.memory * 1.5 ? 'error' : 'warning',
      message: `Peak memory ${profile.memory.peak}MB exceeds budget ${budget.memory}MB`,
    });
  }

  // Check operations
  if (profile.operations.fs.total > budget.operations.fs.reads + budget.operations.fs.writes) {
    violations.push({
      category: 'operations',
      actual: profile.operations.fs.total,
      budget: budget.operations.fs.reads + budget.operations.fs.writes,
      severity: 'warning',
      message: `File system operations ${profile.operations.fs.total} exceed budget ${budget.operations.fs.reads + budget.operations.fs.writes}`,
    });
  }

  if (profile.operations.net.requests > budget.operations.net.requests) {
    violations.push({
      category: 'operations',
      actual: profile.operations.net.requests,
      budget: budget.operations.net.requests,
      severity: 'warning',
      message: `Network requests ${profile.operations.net.requests} exceed budget ${budget.operations.net.requests}`,
    });
  }

  return violations;
}

/**
 * Format budget violations
 */
export function formatBudgetViolations(violations: BudgetViolation[]): string {
  if (violations.length === 0) {
    return '✓ All performance budgets met';
  }

  const lines: string[] = [];
  lines.push(`⚠ Performance Budget Violations (${violations.length}):\n`);

  for (const violation of violations) {
    const emoji = violation.severity === 'error' ? '🔴' : '🟡';
    lines.push(`${emoji} [${violation.severity.toUpperCase()}] ${violation.message}`);
    lines.push(`   Actual: ${violation.actual}, Budget: ${violation.budget}`);
  }

  return lines.join('\n');
}

/**
 * Create default budget based on profile
 */
export function createDefaultBudget(profile: ProfileData, multiplier: number = 1.2): PerformanceBudget {
  return {
    totalDuration: Math.ceil(profile.totalDuration * multiplier),
    memory: Math.ceil(profile.memory.peak * multiplier),
    operations: {
      fs: {
        reads: Math.ceil(profile.operations.fs.reads * multiplier),
        writes: Math.ceil(profile.operations.fs.writes * multiplier),
      },
      net: {
        requests: Math.ceil(profile.operations.net.requests * multiplier),
      },
    },
  };
}

