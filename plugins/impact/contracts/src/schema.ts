import { z } from 'zod';

export const DocRuleSchema = z.object({
  match: z.string(),
  docs: z.array(z.string()).optional(),
  action: z.enum(['review', 'regenerate', 'reindex']),
  command: z.string().optional(),
});

export const ImpactPluginConfigSchema = z.object({
  docRules: z.array(DocRuleSchema),
});
