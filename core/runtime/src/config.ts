/**
 * @module @kb-labs/core-runtime/config
 * Platform configuration types.
 */

import type {
  TenantQuotas,
  LLMTier,
  LLMCapability,
  LLMExecutionPolicy,
  PIIRedactionConfig,
} from '@kb-labs/core-platform';
import type { RateLimitConfig, RateLimitPreset } from '@kb-labs/core-resource-broker';

/**
 * Model entry in tier mapping.
 * Can optionally specify a different adapter per model.
 */
export interface TierModelEntry {
  /** Model identifier */
  model: string;
  /** Priority (lower = higher priority) */
  priority: number;
  /** Model capabilities */
  capabilities?: LLMCapability[];
  /** Optional: adapter package to use for this model (e.g., "@kb-labs/adapters-openai") */
  adapter?: string;
}

/**
 * Tier mapping configuration.
 */
export interface TierMapping {
  small?: TierModelEntry[];
  medium?: TierModelEntry[];
  large?: TierModelEntry[];
}

/**
 * LLM adapter options with tier support.
 */
export interface LLMAdapterOptions {
  /** Default tier when none specified @default 'medium' */
  defaultTier?: LLMTier;
  /** Tier to model mapping (advanced config) */
  tierMapping?: TierMapping;
  /** Legacy: Configured tier (simple config) @deprecated use defaultTier */
  tier?: LLMTier;
  /** Available capabilities (optional) */
  capabilities?: LLMCapability[];
  /** Default model for the underlying adapter (simple config) */
  defaultModel?: string;
  /**
   * Platform-managed default execution policy.
   * Applied to all LLM calls unless explicitly overridden by plugin via useLLM(...execution...).
   */
  executionDefaults?: LLMExecutionPolicy;
  /** Any other adapter-specific options */
  [key: string]: unknown;
}

/**
 * Adapter value type.
 * - string: Single adapter package path
 * - string[]: Multiple adapter packages (first = primary/default, others available via adapterLoader)
 * - null: NoOp adapter
 *
 * @example
 * ```typescript
 * // Single adapter
 * llm: "@kb-labs/adapters-openai"
 *
 * // Multiple adapters (multi-provider setup)
 * llm: ["@kb-labs/adapters-openai", "@kb-labs/adapters-vibeproxy"]
 *
 * // NoOp/disabled
 * analytics: null
 * ```
 */
export type AdapterValue = string | string[] | null;

/**
 * Platform adapter configuration.
 * Each key is the adapter name, value can be:
 * - string: Single adapter package path
 * - string[]: Multiple adapters (first = primary, rest available via routing/options)
 * - null: NoOp adapter
 */
export interface AdaptersConfig {
  /** Analytics adapter package(s) (e.g., "@kb-labs/analytics-adapter" or ["@kb-labs/analytics-file", "@kb-labs/analytics-posthog"]) */
  analytics?: AdapterValue;
  /** Vector store adapter package(s) (e.g., "@kb-labs/adapters-qdrant") */
  vectorStore?: AdapterValue;
  /** LLM adapter package(s) (e.g., "@kb-labs/adapters-openai" or ["@kb-labs/adapters-openai", "@kb-labs/adapters-vibeproxy"]) */
  llm?: AdapterValue;
  /** Embeddings adapter package(s) (e.g., "@kb-labs/adapters-openai/embeddings") */
  embeddings?: AdapterValue;
  /** Cache adapter package(s) (e.g., "@kb-labs/adapters-redis") */
  cache?: AdapterValue;
  /** Storage adapter package(s) (e.g., "@kb-labs/adapters-fs") */
  storage?: AdapterValue;
  /** Logger adapter package(s) (e.g., "@kb-labs/adapters-pino") */
  logger?: AdapterValue;
  /** Event bus adapter package(s) */
  eventBus?: AdapterValue;
  /** Environment provider adapter package(s) (e.g., "@kb-labs/adapters-environment-docker") */
  environment?: AdapterValue;
  /** Workspace provider adapter package(s) (e.g., "@kb-labs/adapters-workspace-localfs") */
  workspace?: AdapterValue;
  /** Snapshot provider adapter package(s) (e.g., "@kb-labs/adapters-snapshot-localfs") */
  snapshot?: AdapterValue;
}

/**
 * Resource manager configuration.
 */
export interface ResourcesConfig {
  /** Default quotas for tenants without explicit quotas */
  defaultQuotas?: Partial<TenantQuotas>;
}

/**
 * Job scheduler configuration.
 */
export interface JobsConfig {
  /** Maximum concurrent jobs per tenant */
  maxConcurrent?: number;
  /** Poll interval in milliseconds for job queue */
  pollInterval?: number;
}

/**
 * Workflow engine configuration.
 */
export interface WorkflowsConfig {
  /** Maximum concurrent workflows per tenant */
  maxConcurrent?: number;
  /** Default workflow timeout in milliseconds */
  defaultTimeout?: number;
}

/**
 * Execution backend configuration.
 * Determines how plugins execute (in-process, worker-pool, remote).
 */
export interface ExecutionConfig {
  /**
   * Execution mode:
   * - 'auto' (default): Auto-detect from environment (EXECUTION_MODE, KUBERNETES_SERVICE_HOST)
   * - 'in-process': Same process, no isolation (dev mode, fast iteration)
   * - 'worker-pool': Worker pool with fault isolation (production, single-node)
   * - 'remote': Remote executor service (Phase 3, distributed fleet)
   * @default 'auto'
   */
  mode?: 'auto' | 'in-process' | 'worker-pool' | 'remote' | 'container';

  /**
   * Container execution options (used when mode=container).
   * RoutingBackend dispatches via Gateway to isolated containers.
   */
  container?: {
    /** URL for the Gateway's internal dispatch endpoint */
    gatewayDispatchUrl: string;
    /** Internal secret for the dispatch endpoint */
    gatewayInternalSecret: string;
  };

  /**
   * Workspace Agent routing options.
   * When enabled, requests with target.type === 'workspace-agent' are dispatched
   * to connected Workspace Agents via Gateway.
   */
  workspaceAgent?: {
    /** Enable workspace-agent routing (default: false) */
    enabled: boolean;
    /** Gateway base URL (e.g., http://localhost:4000) */
    gatewayUrl: string;
    /** Internal secret for Gateway endpoints */
    internalSecret: string;
    /** Fallback when no agent available: 'local' (default) or 'error' */
    fallback?: 'local' | 'error';
  };

  /**
   * Worker pool options (used when mode=worker-pool or auto-detected).
   */
  workerPool?: {
    /** Minimum workers to keep alive @default 2 */
    min?: number;
    /** Maximum concurrent workers @default 10 */
    max?: number;
    /** Max requests per worker before recycling @default 1000 */
    maxRequestsPerWorker?: number;
    /** Max worker uptime before recycling (ms) @default 1800000 (30min) */
    maxUptimeMsPerWorker?: number;
    /** Max concurrent requests per plugin (optional) */
    maxConcurrentPerPlugin?: number;
    /** Warmup policy */
    warmup?: {
      /**
       * Warmup mode (matches plugin-execution types):
       * - 'none': No warmup (cold start on first request)
       * - 'top-n': Warmup top N most-used handlers
       * - 'marked': Warmup handlers marked with warmup: true in manifest
       * @default 'none'
       */
      mode?: 'none' | 'top-n' | 'marked';
      /** Warmup top N most used handlers (for top-n mode) @default 5 */
      topN?: number;
      /** Max handlers to warmup (safety limit) @default 20 */
      maxHandlers?: number;
    };
  };

  /**
   * Remote executor options (used when mode=remote, Phase 3).
   */
  remote?: {
    /** Remote executor service endpoint (gRPC or HTTP) */
    endpoint?: string;
  };
}

/**
 * Resource broker configuration for rate limiting and queue management.
 */
export interface ResourceBrokerConfig {
  /**
   * Use distributed backend via StateBroker.
   * false = InMemoryRateLimitBackend (single process)
   * true = StateBrokerRateLimitBackend (distributed, requires StateBroker daemon)
   * @default false
   */
  distributed?: boolean;

  /**
   * LLM resource configuration.
   */
  llm?: {
    /** Rate limits (preset name or custom config) */
    rateLimits?: RateLimitConfig | RateLimitPreset;
    /** Maximum retry attempts */
    maxRetries?: number;
    /** Request timeout in ms */
    timeout?: number;
  };

  /**
   * Embeddings resource configuration.
   */
  embeddings?: {
    /** Rate limits (preset name or custom config) */
    rateLimits?: RateLimitConfig | RateLimitPreset;
    /** Maximum retry attempts */
    maxRetries?: number;
    /** Request timeout in ms */
    timeout?: number;
  };

  /**
   * Vector store resource configuration.
   */
  vectorStore?: {
    /** Maximum concurrent requests */
    maxConcurrent?: number;
    /** Maximum retry attempts */
    maxRetries?: number;
    /** Request timeout in ms */
    timeout?: number;
  };
}

/**
 * Core features configuration.
 */
export interface CoreFeaturesConfig {
  /** Resource manager configuration */
  resources?: ResourcesConfig;
  /** Job scheduler configuration */
  jobs?: JobsConfig;
  /** Workflow engine configuration */
  workflows?: WorkflowsConfig;
  /** Resource broker configuration */
  resourceBroker?: ResourceBrokerConfig;
  /**
   * Privacy / PII redaction configuration.
   * When enabled, PII is stripped from LLM inputs and restored in outputs.
   * @default { enabled: true, mode: 'reversible' }
   */
  privacy?: PIIRedactionConfig;
}

/**
 * Platform-root hint. When set in a project config, `loadPlatformConfig` uses
 * this path as `platformRoot` (expanding `~` and resolving relative paths
 * against the project root).
 */
export interface PlatformDirConfig {
  /** Absolute or `~`-relative path to the platform workspace. */
  dir?: string;
}

/**
 * Full platform configuration.
 */
export interface PlatformConfig {
  /** Platform-root hint (only honored when set in project config). */
  platform?: PlatformDirConfig;
  /** Adapter packages configuration */
  adapters?: AdaptersConfig;
  /** Optional adapter-specific configuration passed to createAdapter(config) */
  adapterOptions?: Partial<Record<keyof AdaptersConfig, unknown>>;
  /** Core features configuration */
  core?: CoreFeaturesConfig;
  /** Execution backend configuration (NEW: unified plugin execution) */
  execution?: ExecutionConfig;
}

/**
 * Scope policy for each top-level platform-config field. Drives the
 * platform ← project merge performed by `loadPlatformConfig`.
 *
 * - `platform-only`  — project layer is ignored with a warning.
 * - `mergeable`      — project overrides platform via deep merge.
 * - `project-only`   — only the project layer is honored.
 */
export type ConfigFieldScope = 'platform-only' | 'mergeable' | 'project-only';

export const CONFIG_FIELD_SCOPE: Record<keyof PlatformConfig, ConfigFieldScope> = {
  platform: 'project-only',
  adapters: 'mergeable',
  adapterOptions: 'mergeable',
  core: 'platform-only',
  execution: 'platform-only',
};
