/**
 * `query` (agent) wire contract. Response is the frozen `AgentResponse`.
 */

import { z } from 'zod';
import { AgentQueryModeSchema } from './agent.schema';

export const QueryRequestSchema = z.object({
  text: z.string().min(1),
  indexId: z.string().optional(),
  mode: AgentQueryModeSchema.optional(),
});
export type QueryRequest = z.infer<typeof QueryRequestSchema>;

// The query response is the frozen `AgentResponse` — exported from agent.schema.
