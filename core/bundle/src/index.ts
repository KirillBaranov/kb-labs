/**
 * @module @kb-labs/core-bundle
 * Facade package for KB Labs bundle system
 */

export * from './types/types';
export {
  ProfileV2Schema,
  ProfilesV2Schema,
  BundleProfileSchema,
  ScopeV2Schema,
  ResolvedScopeSchema,
  ProfileMetaSchema,
  ProfileTraceSchema,
  BundleProfileSourceSchema,
  type ProfileV2,
  type ScopeV2,
  type BundleProfile,
  type ResolvedScope,
  type ProfileMeta,
  type ProfileTrace,
  type BundleProfileSource,
} from '@kb-labs/core-config';
export * from './api/load-bundle';
export * from './api/explain-bundle';

// Init system
export { initAll, type InitAllOptions, type InitAllResult } from './api/init-all';

// Cache management
export { clearCaches } from '@kb-labs/core-config';

// Re-export ProductId for CLI convenience
export type { ProductId } from '@kb-labs/core-types';
