/**
 * @module @kb-labs/marketplace-contracts
 * Shared types and interfaces for the KB Labs marketplace ecosystem.
 */

export type {
  // PackageSource
  PackageSource,
  MarketplaceEntryWithId,
  ResolvedPackage,
  InstalledPackage,
  PackageListing,
  PublishMetadata,
  PublishResult,

  // EntityKindStrategy
  EntityKindStrategy,
  MarketplaceServiceAPI,

  // ManifestCache
  ManifestCache,
  ManifestCacheEntry,

  // Results
  SyncResult,
  InstallResult,
  InstallResultEntry,
  DoctorReport,
  DoctorIssue,
} from './types.js';
