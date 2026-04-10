/**
 * POST /build-order handler
 *
 * Calculate build order with topological sort.
 * Returns build layers for parallel execution.
 */

import { defineHandler, type PluginContextV3, type RestInput } from '@kb-labs/sdk';
import {
  buildDependencyGraph,
  topologicalSort,
  getBuildOrderForPackage,
  type TopologicalSortResult,
} from '@kb-labs/quality-core/graph';

export type BuildOrderRequest = {
  packageName?: string;
};

export type BuildOrderResponse = {
  layers: string[][];
  sorted: string[];
  circular: string[][];
  packageCount: number;
  layerCount: number;
  hasCircular: boolean;
};

export default defineHandler({
  async execute(
    ctx: PluginContextV3,
    input: RestInput<BuildOrderRequest, unknown>
  ): Promise<BuildOrderResponse> {
    const packageName = input.query?.packageName;

    // Build dependency graph
    const graph = buildDependencyGraph(ctx.cwd);

    // Calculate build order
    let result: TopologicalSortResult;
    if (packageName) {
      result = getBuildOrderForPackage(graph, packageName);
    } else {
      result = topologicalSort(graph);
    }

    return {
      layers: result.layers,
      sorted: result.sorted,
      circular: result.circular,
      packageCount: result.sorted.length,
      layerCount: result.layers.length,
      hasCircular: result.circular.length > 0,
    };
  },
});
