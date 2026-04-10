import { z } from 'zod';

const commandCommonFlags = z.object({
  cwd: z.string().min(1).optional(),
  json: z.boolean().optional(),
  quiet: z.boolean().optional(),
  verbose: z.boolean().optional(),
});

const budgetEnvelopeSchema = z.object({
  usedMs: z.number().nonnegative().optional(),
  limitMs: z.number().nonnegative().optional(),
});

export const MindInitCommandInputSchema = commandCommonFlags.extend({
  force: z.boolean().optional(),
});

export const MindUpdateCommandInputSchema = commandCommonFlags.extend({
  since: z.string().optional(),
  'time-budget': z.number().int().positive().optional(),
  'no-cache': z.boolean().optional(),
});

export const MindUpdateCommandOutputSchema = z.object({
  ok: z.boolean(),
  delta: z.unknown().optional(),
  budget: budgetEnvelopeSchema.optional(),
  timing: z.number().nonnegative().optional(),
  code: z.string().optional(),
  message: z.string().optional(),
  hint: z.string().optional(),
});

const packIntentSchema = z.object({
  intent: z.string().min(1),
  product: z.string().optional(),
  preset: z.string().optional(),
  budget: z.number().int().positive().optional(),
  'with-bundle': z.boolean().optional(),
  out: z.string().optional(),
  seed: z.number().int().optional(),
});

export const MindPackCommandInputSchema = commandCommonFlags.merge(packIntentSchema);

export const MindPackCommandOutputSchema = z.object({
  ok: z.boolean(),
  intent: z.string().optional(),
  product: z.string().nullable().optional(),
  tokensEstimate: z.number().optional(),
  sectionUsage: z.record(z.unknown()).optional(),
  'with-bundle': z.boolean().optional(),
  seed: z.number().optional(),
  deterministic: z.boolean().optional(),
  timing: z.number().nonnegative().optional(),
  'pack-output': z.string().optional(),
  code: z.string().optional(),
  message: z.string().optional(),
  hint: z.string().optional(),
});

export const MindFeedCommandInputSchema = commandCommonFlags
  .merge(packIntentSchema)
  .extend({
    'no-update': z.boolean().optional(),
    since: z.string().optional(),
    'time-budget': z.number().int().positive().optional(),
  });

export const MindFeedCommandOutputSchema = z.object({
  ok: z.boolean(),
  mode: z.enum(['update-and-pack', 'pack-only']).optional(),
  intent: z.string().optional(),
  product: z.string().nullable().optional(),
  tokensEstimate: z.number().optional(),
  out: z.string().nullable().optional(),
  update: z
    .object({
      delta: z.unknown().optional(),
      budget: budgetEnvelopeSchema.optional(),
    })
    .nullable()
    .optional(),
  pack: z
    .object({
      sectionUsage: z.record(z.unknown()).optional(),
      deterministic: z.boolean().optional(),
    })
    .optional(),
  ignoredFlags: z.array(z.string()).optional(),
  timing: z.number().nonnegative().optional(),
  'pack-output': z.string().optional(),
  code: z.string().optional(),
  message: z.string().optional(),
  hint: z.string().optional(),
});

export const MindQueryCommandInputSchema = commandCommonFlags.extend({
  query: z.enum(['impact', 'scope', 'exports', 'externals', 'chain', 'meta', 'docs']),
  file: z.string().optional(),
  path: z.string().optional(),
  scope: z.string().optional(),
  limit: z.number().int().positive().optional(),
  depth: z.number().int().positive().optional(),
  'cache-ttl': z.number().int().nonnegative().optional(),
  'cache-mode': z.enum(['ci', 'local']).optional(),
  'no-cache': z.boolean().optional(),
  paths: z.enum(['id', 'absolute']).optional(),
  compact: z.boolean().optional(),
  'ai-mode': z.boolean().optional(),
  toon: z.boolean().optional(),
  'toon-sidecar': z.boolean().optional(),
  product: z.string().optional(),
  tag: z.string().optional(),
  type: z.string().optional(),
  filter: z.string().optional(),
});

export const MindQueryCommandOutputSchema = z.object({
  ok: z.boolean().optional(),
  format: z.enum(['json', 'toon']).optional(),
  content: z.union([z.string(), z.record(z.unknown())]).optional(),
  error: z.string().optional(),
});

export const MindVerifyCommandInputSchema = commandCommonFlags.extend({
  cwd: z.string().optional(),
});

export const MindVerifyCommandOutputSchema = z.object({
  ok: z.boolean(),
  code: z.string().nullable().optional(),
  inconsistencies: z
    .array(
      z.object({
        file: z.string().optional(),
        expected: z.string().optional(),
        actual: z.string().optional(),
        type: z.string().optional(),
      }),
    )
    .optional(),
  hint: z.string().optional(),
  schemaVersion: z.string().optional(),
  meta: z
    .object({
      cwd: z.string().optional(),
      filesChecked: z.number().optional(),
      timingMs: z.number().optional(),
    })
    .optional(),
});

export const MindQueryRequestSchema = z.object({
  query: z.string().min(1),
  params: z.record(z.unknown()).optional().default({}),
  options: z
    .object({
      cwd: z.string().optional(),
      limit: z.number().optional(),
      depth: z.number().optional(),
      cacheTtl: z.number().optional(),
      cacheMode: z.enum(['local', 'ci']).optional(),
      noCache: z.boolean().optional(),
      pathMode: z.enum(['id', 'absolute']).optional(),
      aiMode: z.boolean().optional(),
    })
    .optional(),
});

export const MindQueryResponseSchema = z.object({
  sections: z.array(
    z.object({
      title: z.string(),
      format: z.string().optional(),
      data: z.unknown(),
      collapsible: z.boolean().optional(),
    }),
  ),
});

export const MindVerifyResponseSchema = z.object({
  cards: z.array(
    z.object({
      title: z.string(),
      content: z.string(),
      status: z.string().optional(),
    }),
  ),
});
