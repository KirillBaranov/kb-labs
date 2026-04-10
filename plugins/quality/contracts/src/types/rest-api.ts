/**
 * REST API Request/Response Types and Zod Schemas for Quality Plugin
 */

import { z } from 'zod';

// ============================================================================
// Stats API
// ============================================================================

export const StatsRequestSchema = z.object({
  includeHealth: z.boolean().optional(),
});

export type StatsRequest = z.infer<typeof StatsRequestSchema>;

export const StatsResponseSchema = z.object({
  packages: z.number(),
  loc: z.number(),
  size: z.string(),
  health: z.number().optional(),
  grade: z.string().optional(),
});

export type StatsResponse = z.infer<typeof StatsResponseSchema>;

// ============================================================================
// Health API
// ============================================================================

export const HealthRequestSchema = z.object({
  detailed: z.boolean().optional(),
});

export type HealthRequest = z.infer<typeof HealthRequestSchema>;

export const HealthIssueSchema = z.object({
  type: z.string(),
  severity: z.number(),
  description: z.string(),
  packages: z.array(z.string()).optional(),
  count: z.number().optional(),
});

export type HealthIssue = z.infer<typeof HealthIssueSchema>;

export const HealthResponseSchema = z.object({
  score: z.number(),
  grade: z.string(),
  issues: z.array(HealthIssueSchema).optional(),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;

// ============================================================================
// Dependencies API
// ============================================================================

export const DependenciesRequestSchema = z.object({});

export type DependenciesRequest = z.infer<typeof DependenciesRequestSchema>;

export const VersionInfoSchema = z.object({
  version: z.string(),
  packages: z.array(z.string()),
  count: z.number(),
});

export type VersionInfo = z.infer<typeof VersionInfoSchema>;

export const DuplicateDependencySchema = z.object({
  name: z.string(),
  versions: z.array(VersionInfoSchema),
  totalPackages: z.number(),
});

export type DuplicateDependency = z.infer<typeof DuplicateDependencySchema>;

export const UnusedDependencySchema = z.object({
  name: z.string(),
  packages: z.array(z.string()),
});

export type UnusedDependency = z.infer<typeof UnusedDependencySchema>;

export const MissingDependencySchema = z.object({
  name: z.string(),
  packages: z.array(z.string()),
  importedIn: z.array(z.string()),
});

export type MissingDependency = z.infer<typeof MissingDependencySchema>;

export const DependenciesResponseSchema = z.object({
  duplicates: z.array(DuplicateDependencySchema),
  unused: z.array(UnusedDependencySchema),
  missing: z.array(MissingDependencySchema),
  totalIssues: z.number(),
});

export type DependenciesResponse = z.infer<typeof DependenciesResponseSchema>;

// ============================================================================
// Build Order API
// ============================================================================

export const BuildOrderRequestSchema = z.object({
  packageName: z.string().optional(),
});

export type BuildOrderRequest = z.infer<typeof BuildOrderRequestSchema>;

export const BuildOrderResponseSchema = z.object({
  layers: z.array(z.array(z.string())),
  sorted: z.array(z.string()),
  circular: z.array(z.array(z.string())),
  packageCount: z.number(),
  layerCount: z.number(),
  hasCircular: z.boolean(),
});

export type BuildOrderResponse = z.infer<typeof BuildOrderResponseSchema>;

// ============================================================================
// Cycles API
// ============================================================================

export const CyclesRequestSchema = z.object({});

export type CyclesRequest = z.infer<typeof CyclesRequestSchema>;

export const CyclesResponseSchema = z.object({
  cycles: z.array(z.array(z.string())),
  count: z.number(),
  hasCircular: z.boolean(),
  affected: z.array(z.string()),
});

export type CyclesResponse = z.infer<typeof CyclesResponseSchema>;

// ============================================================================
// Graph API
// ============================================================================

export const GraphModeSchema = z.enum(['tree', 'reverse', 'impact', 'stats']);

export type GraphMode = z.infer<typeof GraphModeSchema>;

export const GraphRequestSchema = z.object({
  packageName: z.string().optional(),
  mode: GraphModeSchema,
});

export type GraphRequest = z.infer<typeof GraphRequestSchema>;

export const GraphNodeSchema: z.ZodType<GraphNode> = z.lazy(() =>
  z.object({
    name: z.string(),
    children: z.array(GraphNodeSchema).optional(),
  })
);

export type GraphNode = {
  name: string;
  children?: GraphNode[];
};

export const GraphStatsSchema = z.object({
  totalPackages: z.number(),
  maxDepth: z.number(),
  avgDependencies: z.number(),
  mostDepended: z.array(
    z.object({
      name: z.string(),
      count: z.number(),
    })
  ),
});

export type GraphStats = z.infer<typeof GraphStatsSchema>;

export const GraphResponseSchema = z.object({
  mode: GraphModeSchema,
  packageName: z.string().optional(),
  tree: GraphNodeSchema.optional(),
  packages: z.array(z.string()).optional(),
  stats: GraphStatsSchema.optional(),
});

export type GraphResponse = z.infer<typeof GraphResponseSchema>;

// ============================================================================
// Stale API
// ============================================================================

export const StaleRequestSchema = z.object({
  detailed: z.boolean().optional(),
});

export type StaleRequest = z.infer<typeof StaleRequestSchema>;

export const StalePackageSchema = z.object({
  name: z.string(),
  path: z.string(),
  reason: z.enum(['source-newer', 'dependency-rebuilt', 'missing-dist']),
  sourceModified: z.string().optional(),
  distModified: z.string().optional(),
  affectedPackages: z.array(z.string()),
  affectedCount: z.number(),
  severity: z.enum(['critical', 'high', 'medium', 'low']),
});

export type StalePackage = z.infer<typeof StalePackageSchema>;

export const StaleChainSchema = z.object({
  root: z.string(),
  affected: z.array(z.string()),
  depth: z.number(),
});

export type StaleChain = z.infer<typeof StaleChainSchema>;

export const StaleResponseSchema = z.object({
  stalePackages: z.array(StalePackageSchema),
  totalStale: z.number(),
  totalAffected: z.number(),
  criticalChains: z.array(StaleChainSchema).optional(),
});

export type StaleResponse = z.infer<typeof StaleResponseSchema>;
