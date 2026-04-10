/**
 * quality:cycles - Detect circular dependencies
 *
 * Uses DFS to find all circular dependency chains in the monorepo.
 */

import { defineCommand, type PluginContextV3 } from '@kb-labs/sdk';
import {
  buildDependencyGraph,
  findCircularDependencies,
} from '@kb-labs/quality-core/graph';

type CyclesFlags = {
  json?: boolean;
  argv?: string[];
};

type CyclesInput = CyclesFlags & { argv?: string[] };

type CyclesCommandResult = {
  exitCode: number;
  cycles?: string[][];
};

export default defineCommand({
  id: 'quality:cycles',
  description: 'Detect circular dependencies in monorepo',

  handler: {
    async execute(ctx: PluginContextV3, input: CyclesInput): Promise<CyclesCommandResult> {
      const { ui } = ctx;

      // V3: Flags come in input.flags object (not auto-merged)
      const flags = (input as any).flags ?? input;

      // Build dependency graph
      const graph = buildDependencyGraph(ctx.cwd);

      // Find circular dependencies
      const cycles = findCircularDependencies(graph);

      // Output results
      outputCycles(cycles, flags, ui);

      return {
        exitCode: cycles.length > 0 ? 1 : 0,
        cycles,
      };
    },
  },
});

/**
 * Output circular dependencies
 */
function outputCycles(cycles: string[][], flags: any, ui: any) {
  if (flags.json) {
    ui?.json?.({ cycles, count: cycles.length });
    return;
  }

  if (cycles.length === 0) {
    ui?.success?.('No circular dependencies found', {
      title: '✅ Circular Dependencies Check',
      sections: [
        {
          header: 'Result',
          items: ['✅ No circular dependencies detected'],
        },
      ],
    });
    return;
  }

  // Build sections
  const sections: Array<{ header: string; items: string[] }> = [];

  // Summary
  sections.push({
    header: 'Summary',
    items: [
      `⚠️ Found ${cycles.length} circular dependency chain(s)`,
      'These must be broken to enable clean builds',
    ],
  });

  // Show each cycle
  for (let i = 0; i < cycles.length; i++) {
    const cycle = cycles[i];
    if (!cycle) {continue;}
    const cycleItems: string[] = [];

    for (let j = 0; j < cycle.length; j++) {
      const pkg = cycle[j];
      if (j === cycle.length - 1) {
        cycleItems.push(`  ${j + 1}. ${pkg}`);
        const firstPkg = cycle[0];
        cycleItems.push(`  ${j + 2}. ${firstPkg ?? '?'} ⬅ circular!`);
      } else {
        cycleItems.push(`  ${j + 1}. ${pkg}`);
      }
    }

    sections.push({
      header: `Cycle ${i + 1} (${cycle.length} packages)`,
      items: cycleItems,
    });
  }

  // Recommendations
  sections.push({
    header: 'Recommendations',
    items: [
      '1. Extract shared code into a new package',
      '2. Move one dependency to devDependencies',
      '3. Refactor to remove bidirectional dependencies',
      '4. Use dependency injection patterns',
    ],
  });

  ui?.error?.('Circular dependencies detected', {
    title: `⚠️ Circular Dependencies Detected (${cycles.length})`,
    sections,
  });
}
