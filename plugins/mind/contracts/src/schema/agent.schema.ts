/**
 * FROZEN agent-response contract (`agent-response-v1`).
 *
 * This shape is consumed by `CLAUDE.md` and `.claude/skills/task-rag.md` via
 * `pnpm kb mind search --text "..." --agent | grep "^{"`. It MUST stay
 * byte-compatible with the legacy `@kb-labs/mind` output
 * (plugins/mind/orchestrator/src/types.ts). Any change here is a breaking
 * change to that contract and requires bumping the schema version and editing
 * the skill + CLAUDE.md in the same commit.
 *
 * A snapshot test gates this schema against a captured legacy response.
 */

import { z } from 'zod';

export const AGENT_RESPONSE_SCHEMA_VERSION = 'agent-response-v1' as const;

export const AgentQueryModeSchema = z.enum(['instant', 'auto', 'thinking']);
export type AgentQueryMode = z.infer<typeof AgentQueryModeSchema>;

export const AgentSourceKindSchema = z.enum([
  'file',
  'doc',
  'adr',
  'repo',
  'code',
  'config',
  'external',
]);
export type AgentSourceKind = z.infer<typeof AgentSourceKindSchema>;

export const AgentSourceSchema = z.object({
  file: z.string(),
  lines: z.tuple([z.number(), z.number()]).optional(),
  snippet: z.string().optional(),
  kind: AgentSourceKindSchema,
  relevance: z.union([z.number(), z.string()]).optional(),
});
export type AgentSource = z.infer<typeof AgentSourceSchema>;

export const AgentWarningSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.record(z.unknown()).optional(),
});
export type AgentWarning = z.infer<typeof AgentWarningSchema>;

/** Open shape: legacy AgentMeta has an index signature (`[key: string]: unknown`). */
export const AgentMetaSchema = z
  .object({
    schemaVersion: z.string(),
    requestId: z.string(),
    mode: AgentQueryModeSchema,
    timingMs: z.number(),
    cached: z.boolean(),
    confidence: z.number().optional(),
    complete: z.boolean().optional(),
    sources: z.number().optional(),
    indexVersion: z.string().optional(),
    warnings: z.array(AgentWarningSchema).optional(),
  })
  .passthrough();
export type AgentMeta = z.infer<typeof AgentMetaSchema>;

export const AgentSuggestionSchema = z.object({
  type: z.string(),
  label: z.string(),
  ref: z.string(),
});
export type AgentSuggestion = z.infer<typeof AgentSuggestionSchema>;

export const AgentSourcesSummarySchema = z
  .object({
    code: z.number(),
    docs: z.number(),
    external: z.record(z.number()),
  })
  .passthrough();
export type AgentSourcesSummary = z.infer<typeof AgentSourcesSummarySchema>;

export const AgentDebugInfoSchema = z.record(z.unknown());
export type AgentDebugInfo = z.infer<typeof AgentDebugInfoSchema>;

export const AgentResponseSchema = z.object({
  answer: z.string(),
  sources: z.array(AgentSourceSchema),
  confidence: z.number(),
  complete: z.boolean(),
  sourcesSummary: AgentSourcesSummarySchema.optional(),
  warnings: z.array(AgentWarningSchema).optional(),
  suggestions: z.array(AgentSuggestionSchema).optional(),
  meta: AgentMetaSchema,
  debug: AgentDebugInfoSchema.optional(),
});
export type AgentResponse = z.infer<typeof AgentResponseSchema>;

export const AgentErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    recoverable: z.boolean(),
  }),
  meta: AgentMetaSchema,
});
export type AgentErrorResponse = z.infer<typeof AgentErrorResponseSchema>;

/** Confidence bands, preserved from legacy mind. */
export const CONFIDENCE_THRESHOLDS = {
  high: 0.8,
  medium: 0.6,
  low: 0.3,
} as const;
