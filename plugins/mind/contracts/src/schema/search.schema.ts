/**
 * `search` wire contract (CLI `mind search` / REST `POST /search`).
 */

import { z } from 'zod';
import { AgentQueryModeSchema, AgentSourceKindSchema } from './agent.schema';
import { TraceSchema } from '../trace';

export const SearchRequestSchema = z.object({
  text: z.string().min(1),
  indexId: z.string().optional(),
  mode: AgentQueryModeSchema.optional(),
  /** Optional query-intent hint for adaptive fusion weights. */
  intent: z.enum(['lookup', 'concept', 'architecture']).optional(),
  limit: z.number().int().positive().optional(),
});
export type SearchRequest = z.infer<typeof SearchRequestSchema>;

export const SearchResultSchema = z.object({
  file: z.string(),
  lines: z.tuple([z.number(), z.number()]).optional(),
  snippet: z.string().optional(),
  kind: AgentSourceKindSchema,
  score: z.number(),
});
export type SearchResult = z.infer<typeof SearchResultSchema>;

export const SearchResponseSchema = z.object({
  results: z.array(SearchResultSchema),
  confidence: z.number(),
  indexId: z.string(),
  trace: TraceSchema.optional(),
});
export type SearchResponse = z.infer<typeof SearchResponseSchema>;
