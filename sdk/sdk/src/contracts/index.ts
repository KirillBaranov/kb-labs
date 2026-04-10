/**
 * @kb-labs/sdk/contracts
 *
 * Stable contract surface used by SDK consumers.
 */

// Core contract types
export type {
  PluginContextV3,
  PluginContextDescriptor,
  HostContext,
  HostType,
  PermissionSpec,
  UIFacade,
  Colors,
  ColorFunction,
  SideBoxOptions,
  OutputSection,
  PlatformServices,
  RuntimeAPI,
  PluginAPI,
  CommandResult,
  ExecutionTarget,
  CleanupFn,
  ShellAPI,
  ExecResult,
  ExecOptions,
  ManifestV3,
  WebSocketHostContext,
  WSMessage,
  WSSender,
  WSLifecycleEvent,
  WSInput,
} from '@kb-labs/plugin-contracts';

// Runtime contract helpers
export {
  DEFAULT_PERMISSIONS,
  getLoggerMetadataFromHost,
  noopUI,
  noopTraceContext,
  isManifestV3,
  getHandlerPath,
  getHandlerPermissions,
  parseManifest,
  validateManifest,
  resolveHeaderPolicy,
  createExecutionMeta,
} from '@kb-labs/plugin-contracts';
