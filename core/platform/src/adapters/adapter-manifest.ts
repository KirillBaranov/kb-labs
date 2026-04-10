/**
 * @module @kb-labs/core-platform/adapters/adapter-manifest
 * Adapter manifest schema for dependency management and extension points.
 */

/**
 * Adapter type classification.
 *
 * - core: Primary adapter implementing a platform interface (e.g., logger, db)
 * - extension: Adapter that extends another adapter via hooks (e.g., log persistence)
 * - proxy: Adapter that wraps/delegates to another adapter (e.g., IPC proxy)
 */
export type AdapterType = "core" | "extension" | "proxy";

/**
 * Adapter dependency specification.
 *
 * Short form: runtime adapter token (config key in `platform.adapters`)
 * Long form: { id, alias } where alias is used in factory deps parameter
 */
export type AdapterDependency = string | { id: string; alias?: string };

/**
 * Extension point configuration.
 *
 * Describes how this adapter extends another adapter:
 * - adapter: Target adapter ID (e.g., "logger")
 * - hook: Method name on target adapter (e.g., "onLog")
 * - method: Method name on this adapter to call (e.g., "write")
 * - priority: Call order (higher = called first, default: 0)
 */
export interface AdapterExtension {
  /** Target adapter ID to extend */
  adapter: string;

  /** Hook method on target adapter (e.g., "onLog") */
  hook: string;

  /** Method on this adapter to call when hook fires (e.g., "write") */
  method: string;

  /**
   * Priority for extension ordering.
   * Higher values are called first.
   * Default: 0
   * Ties resolved by registration order.
   */
  priority?: number;
}

/**
 * Adapter capabilities declaration.
 *
 * Describes what features this adapter supports.
 * Used for adapter selection and runtime feature detection.
 */
export interface AdapterCapabilities {
  /** Supports streaming/realtime data */
  streaming?: boolean;

  /** Supports batch operations */
  batch?: boolean;

  /** Supports search/query operations */
  search?: boolean;

  /** Supports transactions */
  transactions?: boolean;

  /** Custom capabilities (adapter-specific) */
  custom?: Record<string, unknown>;
}

/**
 * Adapter manifest.
 *
 * Every adapter exports a manifest describing its:
 * - Identity (id, name, version)
 * - Type (core/extension/proxy)
 * - Interface implementation (implements: "ILogger")
 * - Dependencies (requires, optional)
 * - Extension points (extends: { adapter, hook, method })
 * - Capabilities (streaming, batch, search, etc.)
 *
 * @example Core adapter (Pino logger)
 * ```typescript
 * export const manifest: AdapterManifest = {
 *   manifestVersion: '1.0.0',
 *   id: 'pino-logger',
 *   name: 'Pino Logger',
 *   version: '1.0.0',
 *   type: 'core',
 *   implements: 'ILogger',
 *   optional: { adapters: ['analytics'] },
 *   capabilities: { streaming: true }
 * };
 * ```
 *
 * @example Extension adapter (Ring buffer)
 * ```typescript
 * export const manifest: AdapterManifest = {
 *   manifestVersion: '1.0.0',
 *   id: 'log-ringbuffer',
 *   name: 'Log Ring Buffer',
 *   version: '1.0.0',
 *   type: 'extension',
 *   implements: 'ILogRingBuffer',
 *   extends: {
 *     adapter: 'logger',
 *     hook: 'onLog',
 *     method: 'append',
 *     priority: 10
 *   },
 *   capabilities: { streaming: true }
 * };
 * ```
 *
 * @example Extension with dependency (SQLite persistence)
 * ```typescript
 * export const manifest: AdapterManifest = {
 *   manifestVersion: '1.0.0',
 *   id: 'log-persistence',
 *   name: 'SQLite Log Persistence',
 *   version: '1.0.0',
 *   type: 'extension',
 *   implements: 'ILogPersistence',
 *   requires: {
 *     adapters: [{ id: 'db', alias: 'database' }],
 *     platform: '>= 1.0.0'
 *   },
 *   extends: {
 *     adapter: 'logger',
 *     hook: 'onLog',
 *     method: 'write',
 *     priority: 5
 *   },
 *   capabilities: { batch: true, search: true, transactions: true }
 * };
 * ```
 */
export interface AdapterManifest {
  /**
   * Manifest schema version.
   * Used for compatibility checking and evolution.
   * Format: semver (e.g., "1.0.0")
   */
  manifestVersion: string;

  // ═══════════════════════════════════════════════════════════════════════════
  // Identity
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Unique adapter identifier.
   * Used in dependency resolution and configuration.
   * Convention: kebab-case (e.g., "pino-logger", "log-ringbuffer")
   */
  id: string;

  /**
   * Human-readable adapter name.
   * Shown in logs, UI, documentation.
   */
  name: string;

  /**
   * Adapter version.
   * Format: semver (e.g., "1.0.0")
   */
  version: string;

  /**
   * Adapter description (optional).
   * Brief explanation of what this adapter does.
   */
  description?: string;

  /**
   * Author information (optional).
   */
  author?: string;

  /**
   * License (optional).
   * SPDX identifier (e.g., "MIT", "Apache-2.0")
   */
  license?: string;

  /**
   * Homepage URL (optional).
   * Link to documentation or repository.
   */
  homepage?: string;

  // ═══════════════════════════════════════════════════════════════════════════
  // Classification
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Adapter type.
   * - core: Primary adapter implementing a platform interface
   * - extension: Extends another adapter via hooks
   * - proxy: Wraps/delegates to another adapter
   */
  type: AdapterType;

  /**
   * Interface this adapter implements.
   * Convention: PascalCase interface name (e.g., "ILogger", "ILogRingBuffer")
   *
   * This is informational - TypeScript provides compile-time type safety.
   * No runtime type checking is performed.
   */
  implements: string;

  // ═══════════════════════════════════════════════════════════════════════════
  // Dependencies
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Required dependencies.
   *
   * If any required dependency is missing, adapter load fails immediately.
   *
   * @example
   * ```typescript
   * requires: {
   *   adapters: ['db'],                          // Runtime token from config
   *   adapters: [{ id: 'db', alias: 'database' }], // Runtime token + factory alias
   *   platform: '>= 1.0.0'                       // Semver range
   * }
   * ```
   */
  requires?: {
    /**
     * Required adapters by runtime token (config key), NOT by `manifest.id`.
     *
     * Example:
     * - `platform.adapters.cache = "@kb-labs/adapters-redis"`
     * - runtime token is `cache`
     * - provider manifest id can be `redis-cache`
     * - dependency must reference `cache`, not `redis-cache`
     *
     * Each will be passed to factory function in `deps` parameter.
     */
    adapters?: AdapterDependency[];

    /**
     * Required platform version (semver range).
     * Example: ">= 1.0.0", "^1.2.0", "~1.2.3"
     */
    platform?: string;
  };

  /**
   * Optional dependencies.
   *
   * If optional dependency is missing, adapter still loads (no error).
   * Factory function receives `undefined` for missing optional deps.
   *
   * @example
   * ```typescript
   * optional: {
   *   adapters: ['analytics', 'metrics']
   * }
   * ```
   */
  optional?: {
    /** Optional adapters (by ID) */
    adapters?: string[];
  };

  /**
   * Requested runtime contexts.
   *
   * Specifies which runtime contexts this adapter needs.
   * Requested contexts are injected into the adapter's config by the loader.
   *
   * Available contexts:
   * - 'workspace': { cwd: string } - Workspace directory path
   * - 'analytics': AnalyticsContext - Analytics enrichment context (source, actor, runId)
   * - 'tenant': TenantContext - Multi-tenancy context (future)
   * - 'request': RequestContext - HTTP request context (future)
   *
   * @example
   * ```typescript
   * contexts: ['workspace', 'analytics']
   * ```
   */
  contexts?: string[];

  // ═══════════════════════════════════════════════════════════════════════════
  // Extension Point
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Extension point configuration.
   *
   * If present, this adapter extends another adapter via a hook.
   * The platform automatically connects the extension after all adapters load.
   *
   * @example
   * ```typescript
   * extends: {
   *   adapter: 'logger',     // Target adapter
   *   hook: 'onLog',         // Hook method on target
   *   method: 'write',       // Method on this adapter
   *   priority: 5            // Call order (optional)
   * }
   * ```
   */
  extends?: AdapterExtension;

  // ═══════════════════════════════════════════════════════════════════════════
  // Capabilities
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Adapter capabilities.
   *
   * Describes what features this adapter supports.
   * Used for adapter selection and runtime feature detection.
   *
   * @example
   * ```typescript
   * capabilities: {
   *   streaming: true,
   *   batch: true,
   *   search: true,
   *   transactions: true,
   *   custom: { maxBatchSize: 1000 }
   * }
   * ```
   */
  capabilities?: AdapterCapabilities;

  // ═══════════════════════════════════════════════════════════════════════════
  // Configuration Schema (Optional)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Configuration options schema (optional).
   *
   * Declares what configuration options this adapter accepts.
   * Useful for:
   * - Auto-generating documentation
   * - IDE auto-completion
   * - Configuration validation tools
   * - UI configuration builders
   *
   * This is informational only - TypeScript provides compile-time validation.
   *
   * @example
   * ```typescript
   * configSchema: {
   *   level: {
   *     type: 'string',
   *     enum: ['trace', 'debug', 'info', 'warn', 'error'],
   *     default: 'info',
   *     description: 'Minimum log level'
   *   },
   *   pretty: {
   *     type: 'boolean',
   *     default: false,
   *     description: 'Enable pretty printing'
   *   },
   *   batchSize: {
   *     type: 'number',
   *     default: 100,
   *     description: 'Number of logs per batch'
   *   }
   * }
   * ```
   */
  configSchema?: Record<
    string,
    {
      type: "string" | "number" | "boolean" | "object" | "array";
      description?: string;
      default?: unknown;
      required?: boolean;
      enum?: unknown[];
      properties?: Record<string, unknown>;
    }
  >;
}

/**
 * Adapter factory function signature.
 *
 * Every adapter exports a createAdapter function that:
 * - Accepts adapter-specific config
 * - Receives dependencies via deps parameter
 * - Returns adapter instance implementing the declared interface
 *
 * @template TConfig - Adapter configuration type
 * @template TDeps - Dependencies object type (from manifest.requires)
 * @template TAdapter - Adapter interface type (from manifest.implements)
 *
 * @example
 * ```typescript
 * export function createAdapter(
 *   config: PinoConfig,
 *   deps: { analytics?: IAnalytics }
 * ): ILogger {
 *   return new PinoAdapter(config, deps);
 * }
 * ```
 */
export type AdapterFactory<
  TConfig = unknown,
  TDeps = Record<string, unknown>,
  TAdapter = unknown,
> = (config: TConfig, deps: TDeps) => TAdapter | Promise<TAdapter>;
