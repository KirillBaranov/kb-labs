/**
 * Type definitions for the e2e test harness.
 *
 * Service ID and status shapes mirror `infra/kb-labs-dev/internal/manager/events.go`.
 * Keep in sync when kb-dev adds/removes fields.
 */

/**
 * Known service IDs defined in `.kb/devservices.yaml`.
 * Tests should reference services by ID; the controller resolves the URL.
 */
export type ServiceId =
  | 'qdrant'
  | 'redis'
  | 'state-daemon'
  | 'workflow'
  | 'rest'
  | 'marketplace'
  | 'gateway'
  | 'studio'
  | 'kb-web'
  | 'kb-docs'
  | 'kb-app'
  | 'host-agent'
  | 'runtime-server';

/** Service lifecycle states reported by kb-dev. */
export type ServiceState = 'alive' | 'starting' | 'failed' | 'dead' | 'stopping';

export interface ServiceHealth {
  ok: boolean;
  latency?: string;
  slow?: boolean;
}

export interface ServiceStatus {
  state: ServiceState;
  pid?: number;
  pgid?: number;
  startedBy?: string;
  startedAt?: string;
  uptime?: string;
  health?: ServiceHealth;
  port?: number;
  url?: string;
  deps?: string[];
  depsState?: Record<string, string>;
  detail?: string;
  logsTail?: string[];
}

export interface StatusSummary {
  alive: number;
  starting: number;
  failed: number;
  dead: number;
  stopping: number;
  total: number;
}

/** Full status snapshot returned by `kb-dev status --json`. */
export interface StatusSnapshot {
  ok: boolean;
  services: Record<string, ServiceStatus>;
  summary: StatusSummary;
}

/** Per-service action performed during ensure/stop/restart. */
export interface KbDevAction {
  service: string;
  action: 'started' | 'stopped' | 'skipped' | 'failed' | 'restarted' | string;
  reason?: string;
  elapsed?: string;
  error?: string;
  logsTail?: string[];
}

/** Unified result envelope returned by ensure/stop/restart/ready. */
export interface KbDevResult {
  ok: boolean;
  actions?: KbDevAction[];
  hint?: string;
}

/** Options for booting a KbDevController. */
export interface KbDevControllerOptions {
  /** Absolute path to the project root (directory containing `.kb/devservices.yaml`). */
  projectRoot?: string;
  /** Absolute path to the kb-dev binary. Defaults to `<projectRoot>/scripts/kb-dev`. */
  kbDevBin?: string;
  /** Extra env vars passed to every kb-dev subprocess. */
  env?: Record<string, string>;
  /** Called with every stdout/stderr line of every subprocess. For diagnostics. */
  logSink?: (line: string) => void;
}

export interface EnsureOptions {
  /** Timeout for ensure+ready (ms). Default 60_000. */
  timeoutMs?: number;
  /** Kill port occupants before starting. Forwarded as `--force`. */
  force?: boolean;
}
