/**
 * @module @kb-labs/plugin-execution/types
 *
 * Core type definitions for the Execution Layer.
 * These types are the CONTRACT - do not change without versioning.
 *
 * ## Type Strategy: Composition (v3)
 *
 * We use PluginContextDescriptor from plugin-contracts DIRECTLY.
 * No custom ExecutionDescriptor, no converters, no custom HostContext.
 *
 * ExecutionRequest = PluginContextDescriptor + execution-specific fields
 *
 * This means:
 * - `request.descriptor` is passed to `runInProcess()` as-is
 * - Execution-specific fields (pluginRoot, handlerRef, timeout) are separate
 * - No type conversion code = no bugs from conversion
 * - HostContext uses runtime types (host: 'cli' | 'rest' | 'workflow' | 'webhook' | 'cron')
 */

import type {
  PlatformServices,
  PluginContextV3,
  PluginContextDescriptor,
  HostContext,
  HostType,
  PermissionSpec,
  UIFacade,
  InvokeOptions,
} from '@kb-labs/plugin-contracts';
import type {
  ExecutionRequest as CoreExecutionRequest,
  WorkspaceConfig as CoreWorkspaceConfig,
  ArtifactsConfig as CoreArtifactsConfig,
  ExecutionResult as CoreExecutionResult,
  ExecutionResponse as CoreExecutionResponse,
  ExecutionError as CoreExecutionError,
  ExecutionErrorCode as CoreExecutionErrorCode,
  ExecutionMetadata as CoreExecutionMetadata,
  IExecutionBackend as CoreExecutionBackend,
  HealthStatus as CoreHealthStatus,
  ExecutionStats as CoreExecutionStats,
} from '@kb-labs/core-contracts';

// Re-export runtime types for convenience (consumers use these, not custom types)
export type { PluginContextDescriptor, HostContext, HostType, PermissionSpec };

/**
 * Plugin invoker callback for ctx.api.invoke wiring.
 */
export type PluginInvokerFn = <T = unknown>(
  pluginId: string,
  input?: unknown,
  options?: InvokeOptions
) => Promise<T>;

// ============================================================================
// Protocol Version
// ============================================================================

/**
 * Current protocol version.
 * Increment when making breaking changes to ExecutionRequest/ExecutionResult.
 */
export const PROTOCOL_VERSION = 1 as const;

// ============================================================================
// Handler Contract
// ============================================================================

/**
 * Plugin handler contract - UNIFIED for all handler types.
 * All handlers MUST export default satisfying this interface.
 *
 * @example
 * ```typescript
 * // my-handler.ts
 * export default {
 *   execute: async (ctx, input) => {
 *     return { success: true };
 *   }
 * } satisfies PluginHandler;
 * ```
 */
export interface PluginHandler<TInput = unknown, TOutput = unknown> {
  /** Main execution method */
  execute(ctx: PluginContextV3, input: TInput): Promise<TOutput>;

  /** Optional: describe handler for tooling/introspection */
  describe?(): HandlerMetadata;

  /** Optional: input/output schema for validation */
  schema?(): HandlerSchema;

  /** Optional: warmup hook for preloading resources */
  warmup?(): Promise<void>;
}

/**
 * Handler metadata for tooling
 */
export interface HandlerMetadata {
  name: string;
  description?: string;
  version?: string;
  tags?: string[];
}

/**
 * Handler schema for validation
 */
export interface HandlerSchema {
  input?: unknown;   // JSON Schema or Zod schema
  output?: unknown;  // JSON Schema or Zod schema
}

// ============================================================================
// Execution Request
// ============================================================================

/**
 * Execution request - universal for all handler types.
 * This is what consumers pass to backend.execute().
 *
 * ## Composition Approach
 *
 * `descriptor` is PluginContextDescriptor from plugin-contracts.
 * It is passed to runInProcess() AS-IS, no conversion needed.
 *
 * ## Separation of Concerns (v4)
 *
 * - `descriptor` = runtime context (permissions, hostContext, config)
 * - `executionId` = execution layer tracing (NOT same as descriptor.requestId)
 * - `pluginRoot/handlerRef` = file resolution (execution layer concern)
 * - `timeoutMs/workspace/artifacts` = execution configuration
 *
 * Note: descriptor.requestId is for request correlation in distributed tracing.
 * executionId is for this specific execution attempt (may retry same requestId).
 */
export type ExecutionRequest = CoreExecutionRequest<PluginContextDescriptor>;

// ============================================================================
// Workspace Configuration
// ============================================================================

/**
 * Workspace configuration.
 * Defaults to 'local' type with process.cwd().
 */
export type WorkspaceConfig = CoreWorkspaceConfig;

// ============================================================================
// Artifacts Configuration
// ============================================================================

/**
 * Artifacts configuration.
 */
export type ArtifactsConfig = CoreArtifactsConfig;

// ============================================================================
// Execution Result
// ============================================================================

/**
 * Execution result - returned by backend.execute().
 */
export type ExecutionResult = CoreExecutionResult;
export type ExecutionResponse = CoreExecutionResponse;

/**
 * Structured error with code and details.
 */
export type ExecutionError = CoreExecutionError;

/**
 * Standardized error codes.
 *
 * Phase 1: Core codes (all implemented)
 * Phase 2: Pool-specific codes (reserved, not yet implemented)
 */
export type ExecutionErrorCode = CoreExecutionErrorCode;

/**
 * Execution metadata for observability.
 */
export type ExecutionMetadata = CoreExecutionMetadata;

// ============================================================================
// Execution Backend Interface
// ============================================================================

/**
 * Execution backend interface - ONE interface for ALL execution.
 *
 * Implementations:
 * - InProcessBackend (Level 0)
 * - WorkerPoolBackend (Level 1)
 * - RemoteExecutionBackend (Level 2)
 */
type CoreExecutionBackendLifecycle = Pick<CoreExecutionBackend<PluginContextDescriptor>, 'health' | 'stats' | 'shutdown'>;

export interface ExecutionBackend extends CoreExecutionBackendLifecycle {
  /**
   * Execute plugin request with plugin-typed descriptor.
   */
  execute(
    request: ExecutionRequest,
    options?: ExecuteOptions
  ): Promise<ExecutionResult>;

  /**
   * Optional initialization hook for backends that need startup work.
   */
  start?(): Promise<void>;
}

/**
 * Structured log entry emitted during plugin execution.
 * Used by `onLog` callback in `ExecuteOptions` to stream logs to the host.
 */
export interface LogEntry {
  /** Log level */
  level: string;
  /** Log message text */
  message: string;
  /** Output stream: stdout for info/debug, stderr for warn/error */
  stream: 'stdout' | 'stderr';
  /** Monotonic line number within this execution */
  lineNo: number;
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Optional structured metadata */
  meta?: Record<string, unknown>;
}

/**
 * Callback for receiving log entries during execution.
 * Called by the backend as logs are produced — host-agnostic.
 */
export type OnLogCallback = (entry: LogEntry) => void;

/**
 * Execute options.
 */
export interface ExecuteOptions {
  signal?: AbortSignal;
  pluginInvoker?: PluginInvokerFn;
  /**
   * Callback for receiving real-time log entries during execution.
   * Each backend implements this differently:
   * - InProcess: eventEmitter → onLog directly
   * - Subprocess/WorkerPool: IPC LogMessage → parent → onLog
   * - Remote: streaming transport → onLog
   */
  onLog?: OnLogCallback;
  [key: string]: unknown;
}

/**
 * Health status.
 */
export type HealthStatus = CoreHealthStatus;

/**
 * Execution statistics.
 */
export type ExecutionStats = CoreExecutionStats;

// ============================================================================
// Backend Options
// ============================================================================

/**
 * Backend options for factory.
 */
export interface BackendOptions {
  /**
   * Execution mode.
   * - 'auto': Detect based on environment (default)
   * - 'in-process': Always use InProcessBackend (same process, no isolation)
   * - 'subprocess': Always use SubprocessBackend (single subprocess, process isolation)
   * - 'worker-pool': Always use WorkerPoolBackend (pool of workers, production-ready)
   * - 'remote': Always use RemoteExecutionBackend (remote executor service)
   */
  mode?: 'auto' | 'in-process' | 'subprocess' | 'worker-pool' | 'remote';

  /**
   * Platform services.
   * REQUIRED for in-process and worker-pool modes.
   */
  platform: PlatformServices;

  /**
   * UI provider for CLI execution.
   *
   * By default, backend uses noopUI (silent).
   * For CLI, pass a function that returns real UI based on host type.
   *
   * @example
   * ```typescript
   * uiProvider: (hostType) => hostType === 'cli' ? cliUI : noopUI
   * ```
   */
  uiProvider?: (hostType: HostType) => UIFacade;

  /**
   * Optional default plugin invoker for ctx.api.invoke.
   * Used by InProcess backend and can be overridden per execute() call.
   */
  pluginInvoker?: PluginInvokerFn;

  /**
   * Worker pool options (only for worker-pool mode).
   */
  workerPool?: WorkerPoolOptions;

  /**
   * Remote executor options (only for remote mode).
   */
  remote?: RemoteOptions;
}

/**
 * Worker pool options.
 */
export interface WorkerPoolOptions {
  /** Minimum workers (default: 2) */
  min?: number;

  /** Maximum workers (default: 10) */
  max?: number;

  /** Max requests per worker before recycle (default: 1000) */
  maxRequestsPerWorker?: number;

  /** Max uptime per worker before recycle in ms (default: 30 min) */
  maxUptimeMsPerWorker?: number;

  /** Max concurrent executions per plugin (default: no limit) */
  maxConcurrentPerPlugin?: number;

  /** Warmup policy */
  warmup?: WarmupPolicy;
}

/**
 * Warmup policy for worker pool.
 *
 * NOTE: 'all' mode removed - too dangerous (can OOM with many handlers).
 * Use 'marked' or 'top-n' instead.
 */
export interface WarmupPolicy {
  /**
   * Warmup mode.
   * - 'none': No warmup (cold start on first request)
   * - 'top-n': Warmup top N most-used handlers
   * - 'marked': Warmup handlers marked with warmup: true in manifest
   */
  mode: 'none' | 'top-n' | 'marked';

  /** For 'top-n': how many handlers to warmup (default: 5) */
  topN?: number;

  /** Max handlers to warmup (safety limit, default: 20) */
  maxHandlers?: number;
}

/**
 * Remote executor options.
 */
export interface RemoteOptions {
  /**
   * Transport implementation for remote execution.
   * Injected externally — backend does not know what's behind it.
   * Example: GatewayDispatchTransport from @kb-labs/gateway-core.
   */
  transport: import('@kb-labs/core-contracts').IExecutionTransport;

  /**
   * Absolute path on host that maps to /workspace inside container.
   * Used for handlerRef remapping before the request is sent.
   * E.g. '/home/user/projects/kb-labs'
   */
  workspaceRootOnHost?: string;
}
