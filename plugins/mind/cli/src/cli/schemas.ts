/**
 * @module @kb-labs/mind-cli/cli/schemas
 * Input/Output schemas for CLI commands
 */

import { z } from 'zod';

// ============================================================================
// Init Command
// ============================================================================

export const InitInputSchema = z.object({
  cwd: z.string().optional(),
  force: z.boolean().optional().default(false),
  json: z.boolean().optional().default(false),
  verbose: z.boolean().optional().default(false),
  quiet: z.boolean().optional().default(false),
});

export type InitInput = z.infer<typeof InitInputSchema>;

export const InitOutputSchema = z.object({
  ok: z.boolean(),
  mindDir: z.string(),
  cwd: z.string(),
});

export type InitOutput = z.infer<typeof InitOutputSchema>;

// ============================================================================
// Update Command
// ============================================================================

export const UpdateInputSchema = z.object({
  cwd: z.string().optional(),
  since: z.string().optional(),
  timeBudget: z.number().optional(),
  json: z.boolean().optional().default(false),
  verbose: z.boolean().optional().default(false),
  quiet: z.boolean().optional().default(false),
});

export type UpdateInput = z.infer<typeof UpdateInputSchema>;

export const UpdateOutputSchema = z.object({
  ok: z.boolean(),
  updated: z.number(),
  duration: z.number(),
});

export type UpdateOutput = z.infer<typeof UpdateOutputSchema>;

// ============================================================================
// Pack Command
// ============================================================================

export const PackInputSchema = z.object({
  cwd: z.string().optional(),
  intent: z.string(),
  product: z.string().optional(),
  preset: z.string().optional(),
  budget: z.number().optional(),
  withBundle: z.boolean().optional().default(false),
  out: z.string().optional(),
  seed: z.number().optional(),
  json: z.boolean().optional().default(false),
  verbose: z.boolean().optional().default(false),
  quiet: z.boolean().optional().default(false),
});

export type PackInput = z.infer<typeof PackInputSchema>;

export const PackOutputSchema = z.object({
  ok: z.boolean(),
  packPath: z.string(),
  size: z.number(),
});

export type PackOutput = z.infer<typeof PackOutputSchema>;

// ============================================================================
// Feed Command
// ============================================================================

export const FeedInputSchema = z.object({
  cwd: z.string().optional(),
  intent: z.string().optional(),
  product: z.string().optional(),
  preset: z.string().optional(),
  budget: z.number().optional(),
  withBundle: z.boolean().optional().default(false),
  since: z.string().optional(),
  timeBudget: z.number().optional(),
  noUpdate: z.boolean().optional().default(false),
  out: z.string().optional(),
  seed: z.number().optional(),
  json: z.boolean().optional().default(false),
  verbose: z.boolean().optional().default(false),
  quiet: z.boolean().optional().default(false),
});

export type FeedInput = z.infer<typeof FeedInputSchema>;

export const FeedOutputSchema = z.object({
  ok: z.boolean(),
  packPath: z.string(),
  updated: z.number(),
  duration: z.number(),
});

export type FeedOutput = z.infer<typeof FeedOutputSchema>;

// ============================================================================
// Query Command
// ============================================================================

export const QueryInputSchema = z.object({
  cwd: z.string().optional(),
  query: z.enum(['impact', 'scope', 'exports', 'externals', 'chain', 'meta', 'docs']),
  file: z.string().optional(),
  path: z.string().optional(),
  scope: z.string().optional(),
  product: z.string().optional(),
  tag: z.string().optional(),
  type: z.string().optional(),
  filter: z.string().optional(),
  limit: z.number().optional().default(500),
  depth: z.number().optional().default(5),
  cacheMode: z.enum(['ci', 'local']).optional().default('local'),
  cacheTtl: z.number().optional().default(60),
  noCache: z.boolean().optional().default(false),
  paths: z.enum(['id', 'absolute']).optional().default('id'),
  aiMode: z.boolean().optional().default(false),
  toon: z.boolean().optional().default(false),
  toonSidecar: z.boolean().optional().default(false),
  json: z.boolean().optional().default(false),
  compact: z.boolean().optional().default(false),
  quiet: z.boolean().optional().default(false),
});

export type QueryInput = z.infer<typeof QueryInputSchema>;

export const QueryOutputSchema = z.object({
  ok: z.boolean(),
  query: z.string(),
  result: z.any(),
  toonPath: z.string().optional(),
});

export type QueryOutput = z.infer<typeof QueryOutputSchema>;

// ============================================================================
// Verify Command
// ============================================================================

export const VerifyInputSchema = z.object({
  cwd: z.string().optional(),
  json: z.boolean().optional().default(false),
  quiet: z.boolean().optional().default(false),
});

export type VerifyInput = z.infer<typeof VerifyInputSchema>;

export const VerifyOutputSchema = z.object({
  ok: z.boolean(),
  consistent: z.boolean(),
  errors: z.array(z.object({
    file: z.string(),
    message: z.string(),
  })),
});

export type VerifyOutput = z.infer<typeof VerifyOutputSchema>;



