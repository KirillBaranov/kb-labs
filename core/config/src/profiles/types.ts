/**
 * @module @kb-labs/core-config/profiles/types
 * Shared ProfileV2 + BundleProfile types and Zod schemas.
 */

import { z } from 'zod';

const GlobSchema = z.string().min(1, 'Glob pattern must be a non-empty string');
const ProductOverridesSchema = z.record(z.string(), z.unknown());
const ProductsMapSchema = z.record(z.string(), ProductOverridesSchema);

export const ScopeV2Schema = z.object({
  id: z.string().min(1, 'Scope id is required'),
  label: z.string().optional(),
  description: z.string().optional(),
  include: z.array(GlobSchema).min(1, 'include requires at least one glob'),
  exclude: z.array(GlobSchema).optional(),
  products: ProductsMapSchema.optional(),
  default: z.boolean().optional(),
});
export type ScopeV2 = z.infer<typeof ScopeV2Schema>;

export const ProfileMetaSchema = z.object({
  version: z.string().optional(),
  tags: z.array(z.string()).optional(),
  deprecated: z.boolean().optional(),
  owner: z.string().optional(),
}).strict();
export type ProfileMeta = z.infer<typeof ProfileMetaSchema>;

export const ProfileV2Schema = z.object({
  id: z.string().min(1, 'Profile id is required'),
  label: z.string().optional(),
  description: z.string().optional(),
  extends: z.string().min(1, 'extends must reference another profile id or preset').optional(),
  scopes: z.array(ScopeV2Schema).optional(),
  products: ProductsMapSchema.optional(),
  meta: ProfileMetaSchema.optional(),
});
export type ProfileV2 = z.infer<typeof ProfileV2Schema>;

export const ProfilesV2Schema = z.array(ProfileV2Schema);

export const ResolvedScopeSchema = z.object({
  id: z.string(),
  label: z.string().optional(),
  description: z.string().optional(),
  include: z.array(z.string()),
  exclude: z.array(z.string()).optional(),
  isDefault: z.boolean(),
  products: ProductsMapSchema.optional(),
});
export type ResolvedScope = z.infer<typeof ResolvedScopeSchema>;

export const BundleProfileSourceSchema = z.enum(['workspace', 'preset', 'npm', 'implicit']);
export type BundleProfileSource = z.infer<typeof BundleProfileSourceSchema>;

export const ProfileTraceSchema = z.object({
  extends: z.array(z.string()).optional(),
  overrides: z.array(z.string()).optional(),
});
export type ProfileTrace = z.infer<typeof ProfileTraceSchema>;

export const ScopeSelectionSchema = z.object({
  strategy: z.enum(['explicit', 'default', 'auto', 'none']),
  path: z.string().optional(),
});
export type ScopeSelection = z.infer<typeof ScopeSelectionSchema>;

export const BundleProfileSchema = z.object({
  id: z.string(),
  key: z.string().optional(),
  label: z.string().optional(),
  name: z.string().optional(),
  version: z.string().optional(),
  source: BundleProfileSourceSchema,
  scopes: z.array(ResolvedScopeSchema),
  products: ProductsMapSchema.optional(),
  trace: ProfileTraceSchema.optional(),
  meta: ProfileMetaSchema.optional(),
  productsByScope: z.record(z.string(), ProductsMapSchema).optional(),
  activeScopeId: z.string().optional(),
  activeScope: ResolvedScopeSchema.optional(),
  scopeSelection: ScopeSelectionSchema.optional(),
});
export type BundleProfile = z.infer<typeof BundleProfileSchema>;

