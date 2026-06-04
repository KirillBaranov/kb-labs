/**
 * Structured log event types for KB Labs diagnostic layer.
 *
 * Events are emitted via ILogger when KB_DEBUG=true, serialized to stdout
 * by pino, and collected by DiagCollector in e2e tests.
 *
 * Consumers filter log lines by event prefix:
 *   - DiagCollector:   '"event":"kb.diag.'
 *   - PerfCollector:   '"event":"kb.perf.'   (future)
 *   - AuthAuditor:     '"event":"kb.auth.'   (future)
 */

/** General-purpose structured log event envelope. */
export interface KbLogEvent<T = unknown> {
  /** Namespaced event type: 'kb.<domain>.<sub>' */
  event: string;
  /** Schema version — bump when payload shape changes incompatibly. */
  v: 1;
  data: T;
  ts: number;
}

// ─── Adapter pipeline ────────────────────────────────────────────────────────

export interface AdapterStageTrace {
  adapter: string;
  stage: 'resourceBrokerFactory' | 'analyticsFactory' | 'routerFactory' | 'postAssemblyFactory';
  applied: boolean;
}

// ─── Plugin governance ───────────────────────────────────────────────────────

export interface GovernanceMiddlewareInfo {
  name: string;
  slot: string;
  priority: number;
}

export interface PluginGovernanceTrace {
  adapter: string;
  pluginId: string;
  middlewaresApplied: GovernanceMiddlewareInfo[];
  governanceStrategy: 'wrap' | 'pass-through';
}

// ─── Config layers ───────────────────────────────────────────────────────────

export interface ConfigLayersDiag {
  platformConfigPath?: string;
  projectConfigPath?: string;
  overlayPaths: string[];
  fieldSources: Record<string, 'platform' | 'project' | 'both'>;
  ignoredProjectFields: string[];
}

// ─── Plugin discovery ────────────────────────────────────────────────────────

export interface DiscoveredPluginInfo {
  id: string;
  version: string;
  source: string;
}

export interface SkippedPluginInfo {
  code: string;
  message: string;
  pluginId?: string;
}

export interface PluginDiscoveryDiag {
  loaded: DiscoveredPluginInfo[];
  skipped: SkippedPluginInfo[];
}

// ─── Services ────────────────────────────────────────────────────────────────

export interface ServiceDiag {
  port?: number;
  pid?: number;
  url?: string;
  state: string;
}

// ─── Top-level snapshot ──────────────────────────────────────────────────────

export interface DiagSnapshot {
  schemaVersion: 1;
  capturedAt: string;
  pipeline: AdapterStageTrace[];
  governance: PluginGovernanceTrace[];
  config: Partial<ConfigLayersDiag>;
  discovery: Partial<PluginDiscoveryDiag>;
  services: Record<string, ServiceDiag>;
}
