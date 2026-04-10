/**
 * @module @kb-labs/plugin-execution-factory
 *
 * Factory for creating execution backends - extracted to break circular dependencies.
 *
 * This package was extracted from @kb-labs/plugin-execution to eliminate the circular dependency:
 * core-runtime ↔ plugin-execution ↔ plugin-runtime
 *
 * Now the dependency chain is clean:
 * plugin-runtime → plugin-execution-factory → core-runtime
 *
 * @example
 * ```typescript
 * import { createExecutionBackend } from '@kb-labs/plugin-execution-factory';
 *
 * const backend = createExecutionBackend({ platform });
 * ```
 */

// Factory
export { createExecutionBackend } from './factory.js';
export { PROTOCOL_VERSION } from './types.js';

// Isolated execution (unified factory for all hosts)
export {
  createIsolatedExecutionBackend,
  type StrictIsolationOptions,
  type IsolatedBackendOptions,
  type RemoteJobContext,
} from './isolated-backend.js';

// Backends
export {
  InProcessBackend,
  type InProcessBackendOptions,
} from './backends/in-process.js';

export {
  SubprocessBackend,
  type SubprocessBackendOptions,
} from './backends/subprocess.js';

export {
  WorkerPoolBackend,
  type WorkerPoolBackendOptions,
} from './backends/worker-pool/backend.js';

// Adapters
export { SubprocessRunnerAdapter } from './adapters/index.js';

// Worker-pool internals (re-exported for facade package compatibility)
export {
  DEFAULT_WORKER_POOL_CONFIG,
} from './backends/worker-pool/index.js';
export type {
  WorkerPoolConfig,
  WorkerState,
  WorkerInfo,
  WorkerPoolStats,
  QueuedRequest,
  WorkerMessage,
  ExecuteMessage,
  ResultMessage,
  ErrorMessage,
  HealthMessage,
  HealthOkMessage,
  ShutdownMessage,
  ReadyMessage,
} from './backends/worker-pool/index.js';

// Workspace
export {
  type WorkspaceManager,
  type WorkspaceLeaseContext,
  type WorkspaceLease,
  LocalWorkspaceManager,
  localWorkspaceManager,
} from './workspace/index.js';

// Errors and utils
export {
  ExecutionLayerError,
  TimeoutError,
  AbortError,
  HandlerContractError,
  HandlerNotFoundError,
  WorkspaceError,
  PermissionDeniedError,
  ValidationError,
  QueueFullError,
  AcquireTimeoutError,
  WorkerCrashedError,
  WorkerUnhealthyError,
  isExecutionLayerError,
  isKnownErrorCode,
} from './errors.js';
export {
  createExecutionId,
  normalizeError,
  normalizeHeaders,
  createTimeoutPromise,
} from './utils.js';

// Types
export type {
  ExecutionBackend,
  BackendOptions,
  WorkerPoolOptions,
  WarmupPolicy,
  RemoteOptions,
  ExecutionRequest,
  ExecutionResponse,
  ExecutionResult,
  ExecutionError,
  ExecutionErrorCode,
  ExecutionMetadata,
  ExecuteOptions,
  LogEntry,
  OnLogCallback,
  HealthStatus,
  ExecutionStats,
  WorkspaceConfig,
  ArtifactsConfig,
  PluginHandler,
  HandlerMetadata,
  HandlerSchema,
  HostType,
  HostContext,
  PluginContextDescriptor,
  PermissionSpec,
  PluginInvokerFn,
} from './types.js';
