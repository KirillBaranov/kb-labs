/**
 * @module @kb-labs/core-sandbox/types
 * Public types for sandbox system
 */

/**
 * Handler reference - points to a specific handler function
 */
export interface HandlerRef {
  /** Relative path to handler file (e.g., './rest/review.js') */
  file: string;
  /** Export name (e.g., 'handle', 'run') */
  export: string;
}

/**
 * Log stream callback for real-time log output
 */
export type LogStreamCallback = (line: string, level: 'info' | 'warn' | 'error' | 'debug') => void;

/**
 * Execution context - runtime information for handler execution
 */
export interface ExecutionContext {
  /** Context schema version (semver) */
  version?: string;
  
  /** Unique request identifier */
  requestId: string;
  /** Working directory (root of execution) */
  workdir: string;
  /** Output directory (for artifacts) */
  outdir?: string;
  /** Plugin root directory (for module resolution) - REQUIRED */
  pluginRoot: string;
  /** Plugin identifier */
  pluginId?: string;
  /** Plugin version */
  pluginVersion?: string;
  /** Config section identifier (for useConfig() auto-detection) */
  configSection?: string;
  /** User context (optional) */
  user?: {
    id?: string;
  };
  /** Debug mode flag */
  debug?: boolean;
  /** Debug level (verbose, inspect, profile) */
  debugLevel?: 'verbose' | 'inspect' | 'profile';
  /** Debug format (ai, human) */
  debugFormat?: 'ai' | 'human';
  /** JSON mode flag */
  jsonMode?: boolean;
  /** Distributed trace ID */
  traceId?: string;
  /** Current span ID */
  spanId?: string;
  /** Parent span ID */
  parentSpanId?: string;
  /** Log stream callback for real-time output (when debug is enabled) */
  onLog?: LogStreamCallback;
  
  /** Adapter-specific context (typed) */
  adapterContext?: import('./adapter-context.js').HandlerContext;
  
  /** Adapter metadata */
  adapterMeta?: import('./adapter-context.js').AdapterMetadata;
  
  /** Abort signal for cancellation */
  signal?: AbortSignal;
  
  /** Resource tracker for cleanup */
  resources?: import('../cleanup/resource-tracker.js').ResourceTracker;
  
  /** 
   * Extension point for future capabilities
   * 
   * @deprecated Use `runtime` API instead (e.g., `ctx.runtime.invoke()` instead of `ctx.extensions.invoke.invoke()`)
   * This will be removed in a future version. Migrate to runtime API for better type safety and consistency.
   */
  extensions?: {
    artifacts?: any;
    invoke?: any;
    shell?: any;
    events?: any;
  };
  
  /** Lifecycle hooks (optional, for observability) */
  hooks?: import('./lifecycle-hooks.js').LifecycleHooks;
  
  /** Dry-run mode */
  dryRun?: boolean;
  
  /** Analytics emitter (only in inprocess mode) */
  analytics?: (event: Partial<any>) => Promise<any>;
  
  /** Remaining timeout in milliseconds (only in inprocess mode) */
  remainingMs?: () => number;

  /** Platform configuration for worker initialization (NEW) */
  platformConfig?: any; // PlatformConfig from @kb-labs/core-runtime (avoiding type import to prevent circular dep)
}

/**
 * Execution metrics
 */
export interface ExecMetrics {
  /** Wall-clock time in milliseconds */
  timeMs: number;
  /** CPU time in milliseconds (user + system) */
  cpuMs?: number;
  /** Memory usage in megabytes (RSS) */
  memMb?: number;
}

/**
 * Trace span for distributed tracing
 */
export interface TraceSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  startTime: number;
  endTime: number;
  attributes?: Record<string, unknown>;
}

/**
 * Execution result
 */
export interface ExecutionResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    stack?: string;
  };
  metrics: ExecMetrics;
  /** Plugin logs (only in debug mode) */
  logs?: string[];
  /** Distributed traces */
  traces?: TraceSpan[];
}

/**
 * Sandbox configuration
 */
export interface SandboxConfig {
  /** Execution limits */
  execution: {
    timeoutMs: number;
    graceMs: number; // SIGTERM → SIGKILL grace period
    memoryMb: number;
  };
  /** Permissions */
  permissions: {
    env: { allow: string[] };
    filesystem: { allow: string[]; deny: string[]; readOnly: boolean };
    network: { allow: string[]; deny: string[] };
    capabilities: string[];
  };
  /** Monitoring */
  monitoring: {
    collectLogs: boolean;
    collectMetrics: boolean;
    collectTraces: boolean;
    logBufferSizeMb: number;
  };
  /** Runtime mode */
  mode: 'subprocess' | 'inprocess';
  /** Dev mode flag */
  devMode?: boolean;
}

