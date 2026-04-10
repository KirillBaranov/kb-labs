/**
 * Plugin API for V3 Plugin System
 *
 * High-level APIs for plugin functionality: invoke, state, artifacts, shell, events, output, lifecycle.
 */
import type { ExecutionTarget } from './execution-target.js';

// ============================================================================
// Invoke API
// ============================================================================

/**
 * Invoke options
 */
export interface InvokeOptions {
  /**
   * Timeout in milliseconds
   */
  timeout?: number;

  /**
   * Whether to propagate abort signal
   */
  propagateAbort?: boolean;

  /**
   * Optional execution target affinity.
   * When provided, platform should execute invocation in this target context.
   */
  target?: ExecutionTarget;
}

/**
 * API for invoking other plugins
 */
export interface InvokeAPI {
  /**
   * Invoke another plugin command
   *
   * @param pluginId Plugin ID to invoke (e.g., "@kb-labs/my-plugin:my-command")
   * @param input Input data for the plugin
   * @param options Invoke options
   * @returns Plugin output
   */
  call<T = unknown>(pluginId: string, input?: unknown, options?: InvokeOptions): Promise<T>;
}

// ============================================================================
// State API
// ============================================================================

/**
 * API for tenant-aware state management
 *
 * State is automatically scoped by tenant and plugin.
 */
export interface StateAPI {
  /**
   * Get value from state
   *
   * @param key State key
   * @returns State value or undefined
   */
  get<T = unknown>(key: string): Promise<T | undefined>;

  /**
   * Set value in state
   *
   * @param key State key
   * @param value Value to store
   * @param ttlMs Time to live in milliseconds (optional)
   */
  set<T = unknown>(key: string, value: T, ttlMs?: number): Promise<void>;

  /**
   * Delete value from state
   *
   * @param key State key
   */
  delete(key: string): Promise<void>;

  /**
   * Check if key exists in state
   *
   * @param key State key
   */
  has(key: string): Promise<boolean>;

  /**
   * Get multiple values
   *
   * @param keys State keys
   */
  getMany<T = unknown>(keys: string[]): Promise<Map<string, T>>;

  /**
   * Set multiple values
   *
   * @param entries Key-value pairs
   * @param ttlMs Time to live in milliseconds (optional)
   */
  setMany<T = unknown>(entries: Map<string, T> | Record<string, T>, ttlMs?: number): Promise<void>;
}

// ============================================================================
// Artifacts API
// ============================================================================

/**
 * Artifact metadata
 */
export interface ArtifactInfo {
  /**
   * Artifact name
   */
  name: string;

  /**
   * Full path to artifact
   */
  path: string;

  /**
   * Artifact size in bytes
   */
  size: number;

  /**
   * Creation timestamp
   */
  createdAt: number;
}

/**
 * API for managing artifacts (output files)
 *
 * Artifacts are written to the outdir and can be referenced after execution.
 */
export interface ArtifactsAPI {
  /**
   * Write artifact
   *
   * @param name Artifact name (filename)
   * @param content Artifact content
   * @returns Full path to artifact
   */
  write(name: string, content: string | Uint8Array): Promise<string>;

  /**
   * List all artifacts
   */
  list(): Promise<ArtifactInfo[]>;

  /**
   * Read artifact
   *
   * @param name Artifact name
   */
  read(name: string): Promise<string>;

  /**
   * Read artifact as buffer
   *
   * @param name Artifact name
   */
  readBuffer(name: string): Promise<Uint8Array>;

  /**
   * Check if artifact exists
   *
   * @param name Artifact name
   */
  exists(name: string): Promise<boolean>;

  /**
   * Get artifact path
   *
   * @param name Artifact name
   */
  path(name: string): string;
}

// ============================================================================
// Shell API
// ============================================================================

/**
 * Shell execution result
 */
export interface ExecResult {
  /**
   * Exit code
   */
  code: number;

  /**
   * Standard output
   */
  stdout: string;

  /**
   * Standard error
   */
  stderr: string;

  /**
   * Whether command succeeded (code === 0)
   */
  ok: boolean;
}

/**
 * Shell execution options
 */
export interface ExecOptions {
  /**
   * Working directory (default: cwd)
   */
  cwd?: string;

  /**
   * Environment variables to add
   */
  env?: Record<string, string>;

  /**
   * Timeout in milliseconds
   */
  timeout?: number;

  /**
   * Whether to throw on non-zero exit code
   */
  throwOnError?: boolean;
}

/**
 * API for shell command execution
 *
 * Requires shell.allowed permission.
 * Commands are checked against whitelist if specified.
 */
export interface ShellAPI {
  /**
   * Execute shell command
   *
   * @param command Command to execute
   * @param args Command arguments
   * @param options Execution options
   */
  exec(command: string, args?: string[], options?: ExecOptions): Promise<ExecResult>;
}

// ============================================================================
// Events API
// ============================================================================

/**
 * API for event publishing
 *
 * Events are published to the event bus and can be consumed by other plugins.
 */
export interface EventsAPI {
  /**
   * Emit an event
   *
   * @param event Event name
   * @param payload Event payload
   */
  emit(event: string, payload?: unknown): Promise<void>;
}

// ============================================================================
// Lifecycle API
// ============================================================================

/**
 * Cleanup function type
 */
export type CleanupFn = () => void | Promise<void>;

/**
 * API for lifecycle management
 */
export interface LifecycleAPI {
  /**
   * Register cleanup callback
   *
   * Cleanup functions are called in LIFO order (last registered = first called).
   * Each cleanup has a timeout and failures are logged but don't stop other cleanups.
   *
   * @param fn Cleanup function
   */
  onCleanup(fn: CleanupFn): void;
}

// ============================================================================
// Plugin API (Combined)
// ============================================================================

// Import workflow, job, and cron APIs
import type { WorkflowsAPI } from './workflows-api.js';
import type { JobsAPI } from './jobs-api.js';
import type { CronAPI } from './cron-api.js';
import type { EnvironmentAPI } from './environment-api.js';
import type { WorkspaceAPI } from './workspace-api.js';
import type { SnapshotAPI } from './snapshot-api.js';

/**
 * Combined Plugin API interface
 */
export interface PluginAPI {
  /**
   * Invoke other plugins
   */
  readonly invoke: InvokeAPI;

  /**
   * Tenant-aware state management
   */
  readonly state: StateAPI;

  /**
   * Artifacts (output files)
   */
  readonly artifacts: ArtifactsAPI;

  /**
   * Shell command execution
   */
  readonly shell: ShellAPI;

  /**
   * Event publishing
   */
  readonly events: EventsAPI;

  /**
   * Lifecycle management
   */
  readonly lifecycle: LifecycleAPI;

  /**
   * Background workflows (multi-step processes)
   */
  readonly workflows: WorkflowsAPI;

  /**
   * Background jobs (single-step tasks)
   */
  readonly jobs: JobsAPI;

  /**
   * Recurring scheduled tasks (cron jobs)
   */
  readonly cron: CronAPI;

  /**
   * Long-lived execution environments
   */
  readonly environment: EnvironmentAPI;

  /**
   * Workspace lifecycle operations
   */
  readonly workspace: WorkspaceAPI;

  /**
   * Snapshot lifecycle operations
   */
  readonly snapshot: SnapshotAPI;
}
