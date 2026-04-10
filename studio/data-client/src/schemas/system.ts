import { z } from 'zod';
import { isoDateSchema } from './common';

export const healthStatusSchema = z.object({
  ok: z.boolean(),
  timestamp: isoDateSchema,
  sources: z.array(
    z.object({
      name: z.string(),
      ok: z.boolean(),
      latency: z.number().optional(),
      error: z.string().optional(),
    })
  ),
});

