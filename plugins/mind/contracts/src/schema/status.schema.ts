/**
 * `status` and `health` wire contracts.
 */

import { z } from 'zod';

export const IndexSummarySchema = z.object({
  indexId: z.string(),
  documents: z.number(),
  chunks: z.number(),
  lastIndexedAt: z.string().nullable(),
});
export type IndexSummary = z.infer<typeof IndexSummarySchema>;

export const StatusResponseSchema = z.object({
  indexes: z.array(IndexSummarySchema),
  healthy: z.boolean(),
});
export type StatusResponse = z.infer<typeof StatusResponseSchema>;

export const HealthResponseSchema = z.object({
  ok: z.boolean(),
  vectorStore: z.boolean(),
  embeddings: z.boolean(),
  llm: z.boolean(),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
