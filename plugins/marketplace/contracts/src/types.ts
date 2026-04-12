/**
 * @module @kb-labs/marketplace-contracts/types
 * Shared types for the KB Labs marketplace ecosystem.
 */

import type { ManifestV3 } from '@kb-labs/plugin-contracts';
import type {
  EntityKind,
  EntitySignature,
  MarketplaceEntry,
} from '@kb-labs/core-discovery';

// ---------------------------------------------------------------------------
// PackageSource — abstraction over where packages come from
// ---------------------------------------------------------------------------

/**
 * A resolved package ready to be installed.
 */
export interface ResolvedPackage {
  /** Package identifier (@scope/name) */
  id: string;
  /** Resolved version (semver) */
  version: string;
  /** SRI integrity hash (sha256-...) */
  integrity: string;
  /** Platform-issued signature (from registry) */
  signature?: EntitySignature;
  /** How this package was sourced */
  source: 'marketplace' | 'local';
  /** Download URL (for registry-based sources) */
  downloadUrl?: string;
}

/**
 * Metadata about a successfully installed package.
 */
export interface InstalledPackage {
  /** Package identifier */
  id: string;
  /** Installed version */
  version: string;
  /** Absolute path to the installed package root */
  packageRoot: string;
  /** Computed integrity hash */
  integrity: string;
}

/**
 * Brief listing entry for search results.
 */
export interface PackageListing {
  id: string;
  version: string;
  description?: string;
  primaryKind: EntityKind;
  provides: EntityKind[];
  signature?: EntitySignature;
}

/**
 * Metadata required when publishing a package.
 */
export interface PublishMetadata {
  id: string;
  version: string;
  description?: string;
  primaryKind: EntityKind;
  provides: EntityKind[];
}

/**
 * Result of a publish operation.
 */
export interface PublishResult {
  id: string;
  version: string;
  signature?: EntitySignature;
  publishedAt: string;
}

/**
 * Abstraction over the source of packages.
 *
 * Currently: NpmPackageSource (pnpm add/remove).
 * Future: RegistryPackageSource (KB Labs marketplace registry API).
 *
 * MarketplaceService works through this interface — it never calls
 * pnpm or any other package manager directly.
 */
export interface PackageSource {
  /** Resolve a package spec (e.g., "@scope/pkg@^1.0.0") to installable metadata */
  resolve(spec: string): Promise<ResolvedPackage>;

  /** Install a resolved package into the workspace */
  install(pkg: ResolvedPackage, root: string, opts?: { dev?: boolean }): Promise<InstalledPackage>;

  /** Remove a package from the workspace */
  remove(packageId: string, root: string): Promise<void>;

  /** Search available packages (optional — not all sources support it) */
  search?(query: string, filter?: { kind?: EntityKind }): Promise<PackageListing[]>;

  /** Publish a package (optional — only registry source supports it) */
  publish?(tarball: Buffer, metadata: PublishMetadata): Promise<PublishResult>;
}

// ---------------------------------------------------------------------------
// EntityKindStrategy — extensibility contract for new entity types
// ---------------------------------------------------------------------------

/**
 * Public read-only API of MarketplaceService exposed to strategies.
 * Strategies must not depend on the full implementation.
 */
/** Marketplace entry with its package ID (key from lock record). */
export type MarketplaceEntryWithId = MarketplaceEntry & { id: string };

export interface MarketplaceServiceAPI {
  /** List installed entries, optionally filtered by kind */
  list(filter?: { kind?: EntityKind }): Promise<MarketplaceEntryWithId[]>;
  /** Get a single entry by package ID */
  getEntry(packageId: string): Promise<MarketplaceEntry | null>;
}

/**
 * Strategy for handling a specific entity kind in the marketplace.
 *
 * Each entity type (plugin, adapter, workflow, etc.) can have custom
 * detection, extraction, and lifecycle hooks. Adding a new entity type
 * means implementing this interface — zero changes to core.
 */
export interface EntityKindStrategy {
  /** Which primary kind this strategy handles */
  kind: EntityKind;

  /**
   * Detect whether a package at the given root is of this entity kind.
   * Returns the kind if detected, null otherwise.
   */
  detectKind(packageRoot: string): Promise<EntityKind | null>;

  /**
   * Extract all entity kinds this package provides.
   * Called after detectKind succeeds.
   */
  extractProvides(packageRoot: string): Promise<EntityKind[]>;

  /**
   * Resolve the canonical entity ID to use as the lock key.
   * If provided and returns a non-null value, it overrides the package.json name.
   * Useful when the manifest ID differs from the package name (e.g. after folder renames).
   */
  resolveId?(packageRoot: string): Promise<string | null>;

  /**
   * Post-install hook. Called after the package is installed and written to lock.
   * Example: adapter strategy validates that required adapter dependencies are installed.
   */
  afterInstall?(
    packageId: string,
    packageRoot: string,
    service: MarketplaceServiceAPI,
  ): Promise<void>;

  /**
   * Pre-uninstall hook. Called before the package is removed.
   * Example: adapter strategy checks if other adapters depend on this one.
   */
  beforeUninstall?(
    packageId: string,
    service: MarketplaceServiceAPI,
  ): Promise<void>;
}

// ---------------------------------------------------------------------------
// Manifest Cache
// ---------------------------------------------------------------------------

/**
 * Cached manifest entry. Stored in .kb/marketplace.manifests.json.
 * Different entity types have different manifest shapes (ManifestV3, AdapterManifest).
 * Caching avoids dynamic import on every discovery cycle.
 */
export interface ManifestCacheEntry {
  /** Which manifest type is stored */
  manifestType: 'plugin' | 'adapter';
  /** The manifest data. Type depends on manifestType. */
  manifest: ManifestV3 | Record<string, unknown>;
  /** ISO timestamp of when this entry was cached */
  cachedAt: string;
  /** Integrity hash of the source package when cached. Stale if different from lock. */
  integrity: string;
}

/**
 * Full manifest cache file schema.
 */
export interface ManifestCache {
  schema: 'kb.marketplace.manifests/1';
  entries: Record<string, ManifestCacheEntry>;
}

// ---------------------------------------------------------------------------
// Install / Doctor results
// ---------------------------------------------------------------------------

export interface InstallResultEntry {
  id: string;
  version: string;
  primaryKind: EntityKind;
  provides: EntityKind[];
  packageRoot: string;
}

export interface InstallResult {
  installed: InstallResultEntry[];
  warnings: string[];
}

export interface SyncResult {
  added: Array<{ id: string; primaryKind: EntityKind; version: string }>;
  skipped: Array<{ id: string; reason: string }>;
  total: number;
}

export interface DoctorIssue {
  severity: 'error' | 'warning' | 'info';
  packageId: string;
  message: string;
  remediation?: string;
}

export interface DoctorReport {
  ok: boolean;
  total: number;
  issues: DoctorIssue[];
}
