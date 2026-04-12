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
}

export interface FlagDefinition {
  name: string;              // "profile"
  type: "string" | "boolean" | "number" | "array";
  alias?: string;            // "p" - single letter
  default?: any;
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
  shadowed: boolean;         // True if overridden by higher priority
  pkgRoot?: string;          // Package root directory (for workspace/linked plugins)
  packageName?: string;       // Full package name
}

export interface CommandModule {
  run: (ctx: any, argv: string[], flags: Record<string, any>) => Promise<number | void>;
}

export interface DiscoveryResult {
  source: 'workspace' | 'node_modules' | 'linked' | 'builtin';
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
  packages: Record<string, PackageCacheEntry>;  // Changed from flat structure
}

export type AvailabilityCheck = 
  | { available: true }
  | { available: false; reason: string; hint?: string }

