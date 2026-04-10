/**
 * @module @kb-labs/core-discovery/types
 * Core types for marketplace-based entity discovery.
 */

import type { ManifestV3 } from '@kb-labs/plugin-contracts';

// ---------------------------------------------------------------------------
// Entity Signature (platform-issued proof of quality)
// ---------------------------------------------------------------------------

export interface EntitySignature {
  /** Signing algorithm (e.g., 'ed25519', 'sha256-rsa') */
  algorithm: string;
  /** Base64-encoded signature bytes */
  value: string;
  /** Identity of the signer (e.g., 'kb-labs-platform') */
  signer: string;
  /** ISO timestamp of when the signature was created */
  signedAt: string;
  /** List of checks the entity passed (e.g., ['integrity', 'types', 'lint', 'tests']) */
  verifiedChecks: string[];
}

// ---------------------------------------------------------------------------
// Entity Kind (extensible)
// ---------------------------------------------------------------------------

export type EntityKind =
  | 'plugin'
  | 'adapter'
  | 'cli-command'
  | 'rest-route'
  | 'ws-channel'
  | 'workflow'
  | 'webhook'
  | 'job'
  | 'cron'
  | 'studio-widget'
  | 'studio-menu'
  | 'studio-layout'
  | 'skill'
  | 'hook'
  | (string & {});

// ---------------------------------------------------------------------------
// Marketplace Lock (.kb/marketplace.lock)
// ---------------------------------------------------------------------------

export interface MarketplaceLock {
  schema: 'kb.marketplace/2';
  installed: Record<string, MarketplaceEntry>;
}

export interface MarketplaceEntry {
  /** Installed version (semver) */
  version: string;
  /** SRI integrity hash (sha256-...) */
  integrity: string;
  /** Resolved path to the package root (e.g., ./node_modules/@scope/pkg) */
  resolvedPath: string;
  /** ISO timestamp of installation */
  installedAt: string;
  /** How this package was installed */
  source: 'marketplace' | 'local';
  /** Platform-issued signature (optional, for verified packages) */
  signature?: EntitySignature;
  /** Primary entity kind — discriminator for filtering (e.g., 'plugin', 'adapter') */
  primaryKind: EntityKind;
  /** All entity kinds this package provides (extracted from manifest) */
  provides: EntityKind[];
  /** Whether the entity is active (default: true) */
  enabled?: boolean;
}

// ---------------------------------------------------------------------------
// Discovery Result
// ---------------------------------------------------------------------------

export interface DiscoveredPlugin {
  /** Plugin identifier (@scope/name) */
  id: string;
  /** Plugin version (semver) */
  version: string;
  /** Path to the package root */
  packageRoot: string;
  /** How this plugin was installed */
  source: { kind: 'marketplace' | 'local'; path: string };
  /** Display metadata */
  display?: { name?: string; description?: string };
  /** SRI integrity from marketplace.lock */
  integrity?: string;
  /** Platform signature from marketplace.lock */
  signature?: EntitySignature;
  /** Entity kinds extracted from manifest */
  provides: EntityKind[];
}

export interface DiscoveryResult {
  /** Successfully discovered plugins */
  plugins: DiscoveredPlugin[];
  /** Loaded manifests keyed by plugin ID */
  manifests: Map<string, ManifestV3>;
  /** Diagnostic events from the discovery process */
  diagnostics: DiagnosticEvent[];
}

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

export type DiagnosticSeverity = 'error' | 'warning' | 'info' | 'debug';

export interface DiagnosticEvent {
  /** Severity level */
  severity: DiagnosticSeverity;
  /** Machine-readable code for programmatic handling */
  code: DiagnosticCode;
  /** Human-readable description of the issue */
  message: string;
  /** Contextual information about the affected entity */
  context?: {
    pluginId?: string;
    entityKind?: EntityKind;
    entityId?: string;
    filePath?: string;
  };
  /** Unix timestamp of when the event occurred */
  ts: number;
  /** Error stack trace (for errors) */
  stack?: string;
  /** Suggested fix for the issue */
  remediation?: string;
}

export type DiagnosticCode =
  | 'LOCK_NOT_FOUND'
  | 'LOCK_PARSE_ERROR'
  | 'LOCK_SCHEMA_INVALID'
  | 'MANIFEST_NOT_FOUND'
  | 'MANIFEST_PARSE_ERROR'
  | 'MANIFEST_VALIDATION_ERROR'
  | 'MANIFEST_LOAD_TIMEOUT'
  | 'INTEGRITY_MISMATCH'
  | 'SIGNATURE_INVALID'
  | 'SIGNATURE_MISSING'
  | 'DEPENDENCY_MISSING'
  | 'ENTITY_CONFLICT'
  | 'PLUGIN_DISABLED'
  | 'PACKAGE_NOT_FOUND'
  | (string & {});
