/**
 * quality:build-order - Calculate build order and dependency layers
 *
 * Uses topological sort to determine correct build order.
 * Shows build layers where each layer can build in parallel.
 */

import { defineCommand, type PluginContextV3, type UIFacade } from '@kb-labs/sdk';
import {
  buildDependencyGraph,
  topologicalSort,
  getBuildOrderForPackage,
  type TopologicalSortResult,
} from '@kb-labs/quality-core/graph';

type BuildOrderFlags = {
  package?: string;
  layers?: boolean;
  script?: boolean;
  json?: boolean;
  argv?: string[];
};

type BuildOrderInput = BuildOrderFlags & { argv?: string[] };

type BuildOrderCommandResult = {
  exitCode: number;
  result?: TopologicalSortResult;
};

export default defineCommand({
  id: 'quality:build-order',
  description: 'Calculate build order using topological sort',

  handler: {
    async execute(ctx: PluginContextV3, input: BuildOrderInput): Promise<BuildOrderCommandResult> {
      const { ui } = ctx;

      // V3: Flags may come wrapped in input.flags or passed directly
      const flags = ('flags' in input && typeof (input as { flags?: unknown }).flags === 'object' && (input as { flags?: unknown }).flags !== null)
        ? (input as { flags: BuildOrderInput }).flags
        : input;

      // Build dependency graph
      const graph = buildDependencyGraph(ctx.cwd);

      // Calculate build order
      let result: TopologicalSortResult;
      if (flags.package) {
        result = getBuildOrderForPackage(graph, flags.package);
      } else {
        result = topologicalSort(graph);
      }

      // Check for circular dependencies
      if (result.circular.length > 0) {
        ui?.error?.(
          `Found ${result.circular.length} circular dependencies. Build order cannot be determined.`
        );
        outputCircularDependencies(result.circular, ui);
        return { exitCode: 1, result };
      }

      // Output results
      outputBuildOrder(result, flags, ui);

      return { exitCode: 0, result };
    },
  },
});

/**
 * Output build order results
 */
function outputBuildOrder(result: TopologicalSortResult, flags: BuildOrderFlags, ui: UIFacade | undefined) {
  if (flags.json) {
    ui?.json?.(result);
    return;
  }

  if (flags.script) {
    // Output as shell script
    ui?.write?.('#!/bin/bash');
    ui?.write?.('# Generated build script');
    ui?.write?.('set -e');
    ui?.write?.('');

    for (let i = 0; i < result.layers.length; i++) {
      const layer = result.layers[i];
      if (!layer) {continue;}
      ui?.write?.(`# Layer ${i + 1} (${layer.length} packages)`);
      for (const pkg of layer) {
        ui?.write?.(`pnpm --filter "${pkg}" run build`);
      }
      ui?.write?.('');
    }
    return;
  }

  // Build sections
  const sections: Array<{ header: string; items: string[] }> = [];

  if (flags.layers) {
    // Show build layers
    const layerItems: string[] = [];
    for (let i = 0; i < result.layers.length; i++) {
      const layer = result.layers[i];
      if (!layer) {continue;}
      layerItems.push(`Layer ${i + 1}: ${layer.length} packages (can build in parallel)`);
      for (const pkg of layer) {
        layerItems.push(`  • ${pkg}`);
      }
      layerItems.push('');
    }
    sections.push({ header: 'Build Layers', items: layerItems });
  } else {
    // Show sequential order
    const orderItems = result.sorted.map((pkg, idx) => `${idx + 1}. ${pkg}`);
    sections.push({ header: 'Build Order', items: orderItems });
  }

  // Summary
  sections.push({
    header: 'Summary',
    items: [
      `Total packages: ${result.sorted.length}`,
      `Build layers: ${result.layers.length}`,
      `Circular dependencies: ${result.circular.length}`,
    ],
  });

  const title = flags.package
    ? `📦 Build Order for ${flags.package}`
    : '📦 Monorepo Build Order';

  ui?.success?.('Build order calculated successfully', {
    title,
    sections,
  });
}

/**
 * Output circular dependencies
 */
function outputCircularDependencies(cycles: string[][], ui: UIFacade | undefined) {
  const sections: Array<{ header: string; items: string[] }> = [];

  for (let i = 0; i < cycles.length; i++) {
    const cycle = cycles[i];
    if (!cycle) {continue;}
    sections.push({
      header: `Cycle ${i + 1}`,
      items: cycle.map((pkg, idx) => {
        if (idx === cycle.length - 1) {
          const firstPkg = cycle[0];
          return `  ${pkg} → ${firstPkg ?? '?'} (circular!)`;
        }
        return `  ${pkg} →`;
      }),
    });
  }

  ui?.error?.('Circular dependencies detected', {
    title: '⚠️ Circular Dependencies',
    sections,
  });
}
