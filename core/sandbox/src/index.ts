/**
 * @module @kb-labs/core-sandbox
 * Universal sandbox isolation for CLI and REST API
 */

// Types
export type {
  HandlerRef,
  ExecutionContext,
  ExecutionResult,
  ExecMetrics,
  TraceSpan,
  SandboxConfig,
} from './types/index';

// Adapter context types
export type {
  BaseHandlerContext,
  CliHandlerContext,
  RestHandlerContext,
  HandlerContext,
  AdapterMetadata,
} from './types/adapter-context';
export { isCliContext, isRestContext } from './types/adapter-context';

// Adapter registry
export { ADAPTER_TYPES, validateAdapterMetadata } from './types/adapter-registry';

// Handler result types
export type {
  HandlerResult,
  HandlerResultObject,
  HandlerMeta,
} from './types/handler-result';
export { normalizeHandlerResult } from './types/handler-result';

// Lifecycle hooks
export type { LifecycleHooks } from './types/lifecycle-hooks';

// Runner interface
export type { SandboxRunner } from './runner/sandbox-runner';

// Factory
export { createSandboxRunner } from './factory';

// Error handling
export { HandlerErrorCode, normalizeError } from './errors/handler-error';
export type { HandlerError } from './errors/handler-error';

// IPC Serialization
export { serializeContext } from './runner/ipc-serializer';
export type { SerializableContext } from './runner/ipc-serializer';

// Cancellation
export { createTimeoutSignal } from './cancellation/abort-controller';

// Resource tracking
export { ResourceTracker } from './cleanup/resource-tracker';

// Context versioning
export { CURRENT_CONTEXT_VERSION, validateContextVersion } from './versioning/context-version';

// Extensions
export { createExtensionRegistry, EXTENSION_NAMES } from './extensions/registry';
export type { ExtensionRegistry } from './extensions/registry';

// Debug logging
export { createDebugLogger, createLoggerOptionsFromContext } from './debug/logger';
export type { DebugLogger, DebugLoggerOptions, DebugFormat, DebugDetailLevel, DebugLogEntry, ExecutionContextWithDebug } from './debug/logger';
export {
  formatProgressBar,
  formatLiveMetrics,
  formatLogLine,
  colorizeLevel,
  shouldUseColors,
  stripColors,
  Colors,
} from './debug/progress';
export type { ProgressBarOptions, LiveMetrics } from './debug/progress';
export {
  analyzeInsights,
  formatInsights,
} from './debug/insights';
export type { ExecutionInsight, InsightType, InsightSeverity } from './debug/insights';
export {
  compareSnapshots,
  findLatestSnapshots,
  formatDiff,
} from './debug/diff-analyzer';
export type { ExecutionDiff } from './debug/diff-analyzer';
export {
  queryLogs,
  formatLogs,
  parseLogs,
  formatLogEntryHuman,
  formatLogEntryAI,
  formatLogEntryCSV,
} from './debug/log-query';
export type { LogQuery, LogEntry, LogLevel } from './debug/log-query';
export {
  aggregateMetrics,
  formatMetricsDashboard,
} from './debug/metrics-collector';
export type { AggregatedMetrics } from './debug/metrics-collector';
export {
  createTimeTravelSession,
  stepForward,
  stepBackward,
  jumpToSnapshot,
  jumpToPhase,
  addBreakpoint,
  removeBreakpoint,
  checkBreakpoint,
  getCurrentSnapshot,
  inspectContext,
  getCurrentLogs,
  formatSessionStatus,
} from './debug/time-travel';
export type { TimeTravelSession, TimeTravelSnapshot } from './debug/time-travel';

// Pre-flight checks
export { runPreflightChecks } from './validation/preflight';
export type { PreflightResult, PreflightCheck } from './validation/preflight';

// Output system
export { createSandboxOutput, SandboxOutput } from './output/index';
export { SANDBOX_ERROR_CODES } from './errors/error-codes';
export type { SandboxErrorCode } from './errors/error-codes';

// Utilities (for advanced use)
export { pickEnv } from './isolation/env-filter';
export { RingBuffer } from './monitoring/log-collector';
export { collectMetrics } from './monitoring/metrics-collector';
export { createTraceSpan } from './monitoring/trace-collector';
export {
  Profiler,
  formatTimeline,
  exportChromeFormat,
  profileToFlameGraph,
  exportFlameGraphHTML,
  checkPerformanceBudget,
  formatBudgetViolations,
  createDefaultBudget,
} from './monitoring/profiler';
export type {
  ProfileData,
  ProfilePhase,
  FlameGraphNode,
  PerformanceBudget,
  BudgetViolation,
} from './monitoring/profiler';

