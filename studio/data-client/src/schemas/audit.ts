import { z } from 'zod';
import { isoDateSchema } from './common';
import { packageRefSchema, runRefSchema } from './common';

export const auditSummarySchema = z.object({
  ts: isoDateSchema,
  totals: z.object({
    packages: z.number(),
    ok: z.number(),
    warn: z.number(),
    fail: z.number(),
    durationMs: z.number(),
  }),
  topFailures: z.array(
    z.object({
      pkg: z.string(),
      checks: z.array(z.enum(['style', 'types', 'tests', 'build', 'devlink', 'mind'])),
    })
  ),
});

export const auditCheckSchema = z.object({
  id: z.enum(['style', 'types', 'tests', 'build', 'devlink', 'mind']),
  ok: z.boolean(),
  errors: z.number().optional(),
  warnings: z.number().optional(),
  meta: z.unknown().optional(),
});

export const auditPackageReportSchema = z.object({
  pkg: packageRefSchema,
  lastRun: runRefSchema,
  checks: z.array(auditCheckSchema),
  artifacts: z.object({
    json: z.string().optional(),
    md: z.string().optional(),
    txt: z.string().optional(),
    html: z.string().optional(),
  }),
});

