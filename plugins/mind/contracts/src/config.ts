/**
 * Mind configuration (`configSection: 'mind'`).
 *
 * Pure wire/config types — no platform internals. `resolveMindConfig` merges a
 * partial file config onto defaults so callers always get a complete config.
 */

import { z } from 'zod';

export const ChunkConfigSchema = z.object({
  /** Target chunk size in tokens. */
  maxTokens: z.number().int().positive().default(400),
  /** Overlap between adjacent chunks, in tokens. */
  overlapTokens: z.number().int().nonnegative().default(50),
  /** Use AST-aware chunking where a parser exists (falls back to sliding window). */
  ast: z.boolean().default(true),
});

/** Per-mode pipeline budget. Modes are configs of one pipeline, not code paths. */
export const ModeBudgetSchema = z.object({
  /** Max chunks fed into the answer stage. */
  maxChunks: z.number().int().positive(),
  /** Max sub-queries from decomposition (0 = no decomposition). */
  maxSubqueries: z.number().int().nonnegative(),
  /** Completeness-check iterations. */
  maxIterations: z.number().int().nonnegative(),
  /** Whether the synthesize stage calls the LLM. */
  useLLM: z.boolean(),
});

export const ModesConfigSchema = z.object({
  instant: ModeBudgetSchema.default({
    maxChunks: 5,
    maxSubqueries: 0,
    maxIterations: 0,
    useLLM: false,
  }),
  auto: ModeBudgetSchema.default({
    maxChunks: 8,
    maxSubqueries: 3,
    maxIterations: 1,
    useLLM: true,
  }),
  thinking: ModeBudgetSchema.default({
    maxChunks: 12,
    maxSubqueries: 5,
    maxIterations: 3,
    useLLM: true,
  }),
});

export const RetrievalConfigSchema = z.object({
  /** Default number of results returned by `search`. */
  limit: z.number().int().positive().default(10),
  /** Reciprocal-rank-fusion constant. */
  rrfK: z.number().int().positive().default(60),
  /** Enable heuristic reranking of fused candidates. */
  rerank: z.boolean().default(true),
  /** Enable semantic dedup of retrieved chunks. */
  dedup: z.boolean().default(true),
  /**
   * HyDE (Hypothetical Document Embeddings): embed an LLM-generated hypothetical
   * answer instead of the raw query for the vector search (BM25 still uses the
   * raw query). Trades one LLM call per query for better concept-query recall.
   * Off by default — enable only where the bench A/B shows a lift.
   */
  hyde: z.boolean().default(false),
});

export const ConfidenceConfigSchema = z.object({
  /** Below this, agent answers abstain in strict mode. */
  floor: z.number().min(0).max(1).default(0.3),
});

export const MindConfigSchema = z.object({
  /** Default index used when a command omits `--index`. */
  defaultIndex: z.string().default('default'),
  chunk: ChunkConfigSchema.default({}),
  retrieval: RetrievalConfigSchema.default({}),
  modes: ModesConfigSchema.default({}),
  confidence: ConfidenceConfigSchema.default({}),
});

export type MindConfig = z.infer<typeof MindConfigSchema>;
export type MindConfigInput = z.input<typeof MindConfigSchema>;
export type ModeBudget = z.infer<typeof ModeBudgetSchema>;

/**
 * Merge a partial file config onto schema defaults. Always returns a fully
 * populated, validated config.
 */
export function resolveMindConfig(input: MindConfigInput | undefined): MindConfig {
  return MindConfigSchema.parse(input ?? {});
}
