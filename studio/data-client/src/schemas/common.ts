import { z } from 'zod';

export const idSchema = z.string();
export const isoDateSchema = z.string().datetime();

export const packageRefSchema = z.object({
  name: z.string(),
  version: z.string().optional(),
  private: z.boolean().optional(),
  path: z.string().optional(),
});

export const runRefSchema = z.object({
  id: idSchema,
  startedAt: isoDateSchema,
  endedAt: isoDateSchema.optional(),
  status: z.enum(['pending', 'ok', 'warn', 'fail']),
});

export const actionResultSchema = z.object({
  ok: z.boolean(),
  message: z.string().optional(),
  runId: idSchema.optional(),
});

