/**
 * @kb-labs/sdk
 *
 * V3 Plugin System SDK - Helpers for command/route/action/webhook definitions and testing.
 */

// Command definitions
export {
  defineCommand,
  defineRoute,
  defineAction,
  defineWebhook,
  defineWebSocket,
  isCLIHost,
  isRESTHost,
  isWorkflowHost,
  isWebhookHost,
  isWSHost,
  type CommandHandler,
  type CommandDefinition,
  type CLIInput,
  type RouteHandler,
  type RouteDefinition,
  type ActionHandler,
  type ActionDefinition,
  type WebhookHandler,
  type WebhookDefinition,
  type WebSocketHandler,
  type WebSocketDefinition,
  type TypedSender,
  // Message system
  defineMessage,
  MessageBuilder,
  MessageRouter,
} from './command/index.js';

// Test utilities (legacy — prefer `@kb-labs/sdk/testing` for full mock builders)
export {
  createTestContext,
  type CreateTestContextOptions,
} from './test/index.js';

// Utilities
export {
  type ExtractHostContext,
  type ContextForHost,
} from './utils/index.js';

// Re-export UI utilities from shared
export {
  TimingTracker,
  useLoader,
  displayArtifacts,
  displayArtifactsCompact,
  displaySingleArtifact,
  type Loader,
  type ArtifactInfo,
  // Env system
  defineEnv,
  parseEnvFromRuntime,
  type EnvSchema,
  type EnvDefinition,
} from '@kb-labs/shared-cli-ui';

// Re-export runtime hooks
export {
  usePlatform,
  isPlatformConfigured,
  useConfig,
  useLLM,
  isLLMAvailable,
  getLLMTier,
  useEmbeddings,
  isEmbeddingsAvailable,
  useVectorStore,
  isVectorStoreAvailable,
  useAnalytics,
  trackAnalyticsEvent,
  useLogger,
  useLoggerWithContext,
  useStorage,
  useCache,
  isCacheAvailable,
  useEnv,
  // LLM types (for tier-based selection)
  type LLMTier,
  type UseLLMOptions,
} from './hooks/index.js';

// Re-export helpers from shared-command-kit (for convenience)
export {
  // REST handler definition
  defineHandler,
  type Handler,
  type HandlerDefinition,
  type RestInput,
  // Error utilities
  defineError,
  PluginError,
  commonErrors,
  type ErrorDefinition,
  type ErrorDefinitions,
} from '@kb-labs/shared-command-kit';

// Re-export new flags system from shared-command-kit
export {
  defineFlags,
  type FlagSchemaWithInfer,
  type InferFlags,
  type FlagSchemaDefinition,
  type FlagSchema,
  type BooleanFlagSchema,
  type StringFlagSchema,
  type NumberFlagSchema,
  type ArrayFlagSchema,
  type FlagType,
  type FlagValidationError,
  type ValidationResult,
  type SafeValidationResult,
} from '@kb-labs/shared-command-kit';

// Re-export platform adapter types from core-platform
export type {
  ILLM,
  LLMOptions,
  LLMResponse,
  LLMTool,
  LLMToolCall,
  LLMToolCallOptions,
  LLMToolCallResponse,
  LLMMessage,
  IAnalytics,
  IStorage,
  ICache,
  IEmbeddings,
  ILogger,
  IVectorStore,
} from '@kb-labs/core-platform';

// Re-export sys utilities
export { findRepoRoot, discoverSubRepoPaths } from '@kb-labs/core-sys';


// Re-export monitoring from runtime
export {
  getMonitoringSnapshot,
  getDegradedStatus,
  type MonitoringSnapshot,
  type MonitoringOptions,
  type DegradedStatus,
  type DegradedOptions,
  type DegradedLevel,
} from '@kb-labs/core-runtime';

// Re-export learning stores from platform
export type {
  IHistoryStore,
  HistoryRecord,
  HistoryFindOptions,
  IFeedbackStore,
  FeedbackRecord,
  FeedbackType,
} from '@kb-labs/core-platform';
export {
  MemoryHistoryStore,
  MemoryFeedbackStore,
  FileHistoryStore,
  FileFeedbackStore,
  type FileHistoryStoreOptions,
  type FileFeedbackStoreOptions,
} from '@kb-labs/core-platform';


// Manifest utilities
export {
  defineManifest,
  defineCommandFlags,
  // TODO: V3 migration - permissions helpers need to be rewritten for V3 PermissionSpec structure
  // permissions,
  generateExamples,
  type ExampleCase,
} from './manifest/index.js';

// Re-export contracts for convenience
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
  // Shell API types
  ShellAPI,
  ExecResult,
  ExecOptions,
  // Manifest types
  ManifestV3,
  // WebSocket types
  WebSocketHostContext,
  WSMessage,
  WSSender,
  WSLifecycleEvent,
  WSInput,
} from './contracts/index.js';

// Re-export tool factory
export {
  createTool,
  type ToolSpec,
  type ToolShape,
  type ToolDefinitionShape,
} from '@kb-labs/shared-tool-kit';

// Re-export permission presets
export {
  // Presets
  minimal as minimalPreset,
  gitWorkflow as gitWorkflowPreset,
  npmPublish as npmPublishPreset,
  fullEnv as fullEnvPreset,
  kbPlatform as kbPlatformPreset,
  llmAccess as llmAccessPreset,
  vectorStore as vectorStorePreset,
  ciEnvironment as ciEnvironmentPreset,
  presets,
  // Builder
  combine as combinePermissions,
  combinePresets,
  // Types
  type PermissionPreset,
  type PresetBuilder,
} from '@kb-labs/perm-presets';

// Studio V2 types (Module Federation pages)
export type {
  StudioConfig,
  StudioPageEntry,
  StudioMenuEntry,
} from '@kb-labs/plugin-contracts';

// UIKit data contracts (REST response shapes)
export type {
  TableData,
  TableRow,
  SelectData,
  SelectOptionItem,
  MetricData,
  ListData,
  ListItem,
} from '@kb-labs/studio-ui-kit';
