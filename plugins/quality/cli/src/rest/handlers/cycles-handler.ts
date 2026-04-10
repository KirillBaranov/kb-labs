/**
 * POST /cycles handler
 *
 * Detect circular dependencies in monorepo.
 * Returns all circular dependency chains.
 */

import { defineHandler, type PluginContextV3, type RestInput } from '@kb-labs/sdk';
import {
  buildDependencyGraph,
  findCircularDependencies,
} from '@kb-labs/quality-core/graph';

export type CyclesRequest = Record<string, never>; // Empty object

export type CyclesResponse = {
  cycles: string[][];
  cycleCount: number;
  hasCircular: boolean;
  affectedPackages: string[];
};

export default defineHandler({
  async execute(
    ctx: PluginContextV3,
    input: RestInput<unknown, CyclesRequest>
  ): Promise<CyclesResponse> {
    // Build dependency graph
    const graph = buildDependencyGraph(ctx.cwd);

    // Find circular dependencies
    const cycles = findCircularDependencies(graph);

    // Get all affected packages (unique)
    const affectedPackages = Array.from(
      new Set(cycles.flat())
    );

    return {
      cycles,
      cycleCount: cycles.length,
      hasCircular: cycles.length > 0,
      affectedPackages,
    };
  },
});
