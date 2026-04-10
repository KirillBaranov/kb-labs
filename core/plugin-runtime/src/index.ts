/**
 * @kb-labs/plugin-runtime
 *
 * V3 Plugin System Runtime - Context factory, sandboxed shims, and APIs.
 */

// Context
export {
  createPluginContextV3,
  createTraceContext,
  type CreateContextOptions,
  type CreateContextResult,
  type CreateTraceContextOptions,
} from './context/index.js';

// Runtime (sandboxed shims)
export {
  createRuntimeAPI,
  createFSShim,
  createFetchShim,
  createEnvShim,
  type CreateFSShimOptions,
  type CreateRuntimeAPIOptions,
} from './runtime/index.js';

// API
export {
  createPluginAPI,
  createLifecycleAPI,
  createStateAPI,
  createArtifactsAPI,
  createShellAPI,
  createEventsAPI,
  createNoopEventsAPI,
  createInvokeAPI,
  createNoopInvokeAPI,
  createWorkflowsAPI,
  createNoopWorkflowsAPI,
  createJobsAPI,
  createNoopJobsAPI,
  createEnvironmentAPI,
  createNoopEnvironmentAPI,
  createWorkspaceAPI,
  createNoopWorkspaceAPI,
  createSnapshotAPI,
  createNoopSnapshotAPI,
  executeCleanup,
  type CreatePluginAPIOptions,
  type EventEmitterFn,
  type PluginInvokerFn,
} from './api/index.js';

// Utils
export {
  createId,
  createShortId,
  extractTraceId,
  createRequestId,
} from './utils/index.js';

// Sandbox
export {
  runInProcess,
  runInSubprocess,
  type RunInProcessOptions,
  type RunInSubprocessOptions,
} from './sandbox/index.js';

// Host Wrappers
export {
  wrapCliResult,
  wrapRestResult,
  unwrapRestData,
  type RestResultWithMeta,
} from './host/index.js';

// Re-export contracts for convenience
export type {
  PluginContextV3,
  PluginContextDescriptor,
  HostContext,
  HostType,
  PermissionSpec,
  UIFacade,
  Spinner,
  TraceContext,
  PlatformServices,
  RuntimeAPI,
  PluginAPI,
  CleanupFn,
  // Runner types
  RunResult,
  ExecutionMeta,
  // CLI types (for wrapCliResult)
  CommandResult,
  CommandResultWithMeta,
  StandardMeta,
} from '@kb-labs/plugin-contracts';
