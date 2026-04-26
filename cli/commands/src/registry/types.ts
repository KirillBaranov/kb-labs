/**
 * @kb-labs/cli-commands/registry
 * Type definitions for the plugin system
 */

import type { ManifestV3 } from '@kb-labs/plugin-contracts';

export interface CommandManifest {
  manifestVersion: '1.0';    // Required for validation
  id: string;                // "mind:pack" (must be namespace:command)
  aliases?: string[];        // ["mind-pack", "m:pack"]
  group: string;             // "mind" (namespace)
  subgroup?: string;         // "plugins" (nested group within parent)
  describe: string;
  longDescription?: string;
  requires?: string[];       // ["@kb-labs/mind-pack@^1.0.0"] (semver ranges)
  flags?: FlagDefinition[];
  examples?: string[];
  loader?: () => Promise<CommandModule>;
  
  // New fields (optional for backward compatibility)
  package?: string;          // Full package name (e.g., "@kb-labs/devlink-entry")
  namespace?: string;        // Explicit namespace (derived from group/id if not provided)
  engine?: {                // Engine requirements
    node?: string;          // e.g., ">=18", "^18.0.0"
    kbCli?: string;         // e.g., "^1.5.0"
    module?: 'esm' | 'cjs'; // Module type
  };
  permissions?: string[];   // e.g., ["fs.read", "git.read", "net.fetch"]
  telemetry?: 'opt-in' | 'off'; // Telemetry preference
  manifestV2?: ManifestV3;  // Full ManifestV3 for sandbox execution
  pkgRoot?: string;          // Package root directory (set at load time, not persisted to cache)
  /** Internal flag: true for synthetic "unavailable" manifests that must not be cached. */
  _synthetic?: boolean;
}

export interface FlagDefinition {
  name: string;              // "profile"
  type: "string" | "boolean" | "number" | "array";
  alias?: string;            // "p" - single letter
  default?: string | boolean | number | string[];
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
   * `<projectRoot>/.kb/plugins/` reports `project`. On collision (same
   * packageName in both scopes) the platform entry wins — see ADR-0012.
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

