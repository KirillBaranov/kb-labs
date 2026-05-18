/**
 * @kb-labs/cli-commands/registry
 * Type definitions for the plugin system
 */

import type { ManifestV3 } from '@kb-labs/plugin-contracts';

export interface CommandManifest {
  manifestVersion: '1.0';
  /** Canonical routing key — full path segments, e.g. ['clickup', 'task', 'search'] */
  segments: readonly string[];
  /** Last segment — e.g. 'search' */
  id: string;
  /** First segment — e.g. 'clickup' */
  group: string;
  /** Second segment when depth >= 3 — e.g. 'task' */
  subgroup?: string;
  aliases?: string[];
  category?: string;
  /** One-line description shown in group help (under 50 chars, no trailing period). */
  describe: string;
  longDescription?: string;
  requires?: string[];
  flags?: FlagDefinition[];
  examples?: string[];
  loader?: () => Promise<CommandModule>;
  package?: string;
  engine?: {
    node?: string;
    kbCli?: string;
    module?: 'esm' | 'cjs';
  };
  permissions?: string[];
  telemetry?: 'opt-in' | 'off';
  manifestV2?: ManifestV3;
  pkgRoot?: string;
  /** Internal flag: true for synthetic "unavailable" manifests that must not be cached. */
  _synthetic?: boolean;
  /** Archetype from manifest — drives automatic flag injection and --schema generation. */
  operationType?: 'read' | 'mutate' | 'execute' | 'analyze';
}

export interface FlagDefinition {
  name: string;              // "profile"
  type: "string" | "boolean" | "number" | "array";
  alias?: string;            // "p" - single letter
  default?: unknown;
  description?: string;
  describe?: string;
  choices?: string[];        // ["dev", "prod"] - only for string type
  required?: boolean;
  examples?: string[];
}

export interface RegisteredCommand {
  manifest: CommandManifest;
  v3Manifest?: ManifestV3;   // Full V3 manifest (clean naming, replaces manifestV2 field)
  available: boolean;
  unavailableReason?: string;
  hint?: string;
  source: 'workspace' | 'node_modules' | 'linked' | 'builtin';
  scope?: 'platform' | 'project'; // Scope the manifest was discovered in (see ADR-0012)
  shadowed: boolean;         // True if overridden by higher priority
  pkgRoot?: string;          // Package root directory (for workspace/linked plugins)
  packageName?: string;       // Full package name
  /** Lifecycle dispose hook, set by manifest module if it exports `dispose`. */
  _disposeHook?: () => Promise<void>;
}

export interface CommandModule {
  run: (ctx: unknown, argv: string[], flags: Record<string, unknown>) => Promise<number | void>;
}

export interface DiscoveryResult {
  source: 'workspace' | 'node_modules' | 'linked' | 'builtin';
  /**
   * Scope this result came from. Platform-wide discovery (monorepo workspace,
   * platform node_modules) reports `platform`; discovery from
   * `<projectRoot>/.kb/plugins/` or `<projectRoot>` workspace reports `project`.
   * On collision (same packageName in both scopes) the project entry wins —
   * project overrides platform defaults.
   */
  scope: 'platform' | 'project';
  packageName: string;
  manifestPath: string;      // Absolute JS path (POSIX)
  pkgRoot: string;           // Absolute package directory (POSIX)
  manifests: CommandManifest[];
}

export interface GlobalFlags {
  json?: boolean;
  onlyAvailable?: boolean;
  noCache?: boolean;
  verbose?: boolean;
  quiet?: boolean;
  help?: boolean;
  version?: boolean;
  dryRun?: boolean;  // Global --dry-run flag for simulating commands
}

export interface PackageCacheEntry {
  version: string;           // From package.json
  manifestHash: string;      // SHA256 of manifest file
  manifestPath: string;
  pkgJsonMtime: number;
  manifestMtime: number;
  cachedAt: number;
  result: DiscoveryResult;
}

export interface CacheFile {
  version: string;           // Node version
  cliVersion: string;        // CLI version
  discoveryVersion?: number; // Bump when discovery logic changes to force cache invalidation
  timestamp: number;
  ttlMs?: number;
  stateHash?: string;
  lockfileHash?: string;     // Hash of pnpm-lock.yaml
  configHash?: string;       // Hash of kb-labs.config.json
  pluginsStateHash?: string; // Hash of .kb/plugins.json
  /** Hash of <platformRoot>/.kb/marketplace.lock. Invalidates when global plugins change. */
  platformMarketplaceLockHash?: string;
  /** Hash of <projectRoot>/.kb/marketplace.lock. Invalidates when project-scoped plugins change. */
  projectMarketplaceLockHash?: string;
  /** Absolute platform root at the time of caching — cache is invalid if it differs on next run. */
  platformRoot?: string;
  /** Absolute project root at the time of caching. */
  projectRoot?: string;
  packages: Record<string, PackageCacheEntry>;  // Changed from flat structure
}

export type AvailabilityCheck = 
  | { available: true }
  | { available: false; reason: string; hint?: string }

