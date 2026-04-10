/**
 * @module @kb-labs/plugin-execution/types
 *
 * Facade surface:
 * - canonical execution contracts from @kb-labs/core-contracts
 * - backend/runtime specializations from @kb-labs/plugin-execution-factory
 * - worker-pool operational types from local backend module
 */

export { PROTOCOL_VERSION } from '@kb-labs/plugin-execution-factory';
export { DEFAULT_WORKER_POOL_CONFIG } from '@kb-labs/plugin-execution-factory';

export type {
  ExecutionDescriptorCore,
  ExecutionTarget,
  WorkspaceConfig,
  ArtifactsConfig,
  ExecutionResponse,
} from '@kb-labs/core-contracts';

export type {
  ExecutionRequest,
  ExecutionResult,
  ExecutionError,
  ExecutionErrorCode,
  ExecutionMetadata,
  ExecuteOptions,
  LogEntry,
  OnLogCallback,
  ExecutionBackend,
  HealthStatus,
  ExecutionStats,
  PluginInvokerFn,
  BackendOptions,
  WorkerPoolOptions,
  WarmupPolicy,
  RemoteOptions,
  PluginHandler,
  HandlerMetadata,
  HandlerSchema,
  HostType,
  HostContext,
  PluginContextDescriptor,
  PermissionSpec,
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
} from '@kb-labs/plugin-execution-factory';
