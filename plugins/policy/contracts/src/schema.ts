import { z } from 'zod';

export const PolicyRuleConfigSchema = z.object({
  description: z.string(),
  severity: z.enum(['error', 'warning']),
  config: z.record(z.unknown()).optional(),
});

export const PolicyCategoryConfigSchema = z.object({
  paths: z.array(z.string()),
  rules: z.array(z.string()),
});

export const PolicyConfigSchema = z.object({
  categories: z.record(PolicyCategoryConfigSchema),
  rules: z.record(PolicyRuleConfigSchema),
});

export type PolicyConfigInput = z.input<typeof PolicyConfigSchema>;
