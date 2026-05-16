import type { PermissionSpec, AnalyticsAdapter as IAnalytics } from '@kb-labs/plugin-contracts';
import type { ITransport } from '@kb-labs/core-ipc';

// ─── Middleware contract ────────────────────────────────────────────────────

/** Wrap an adapter instance with additional behaviour. Returns the wrapped adapter. */
export type AdapterMiddlewareFn<T> = (adapter: T, ctx: MiddlewareContext) => T;

export interface MiddlewareContext {
  readonly permissions: PermissionSpec;
  readonly pluginId: string;
  readonly lifecycle: AdapterLifecycle;
}

/** Lifecycle hooks available to middleware. Registered during wrap(), called by the platform. */
export interface AdapterLifecycle {
  onReady(fn: () => void | Promise<void>): void;
  onDispose(fn: () => void | Promise<void>): void;
  /** Subscribe to a platform lifecycle event (e.g. 'resource-broker:quota-reset:llm'). */
  on(event: string, fn: (...args: unknown[]) => void): void;
}

// ─── Governance definition ──────────────────────────────────────────────────

export type GovernanceDef<T> =
  | { readonly strategy: 'pass-through' }
  | { readonly strategy: 'wrap'; readonly fn: AdapterMiddlewareFn<T> };

// ─── IPC transport definition ───────────────────────────────────────────────

export type IPCDef<T> =
  /** Forwards calls to parent process via IPC transport. */
  | { readonly strategy: 'proxy'; readonly create: (transport: ITransport) => T }
  /** Returns a local noop implementation (e.g. analytics, eventBus stubs). */
  | { readonly strategy: 'noop'; readonly create: () => T }
  /** Adapter is always local to the process (e.g. logger). */
  | { readonly strategy: 'local' }
  /** Optional adapter not proxied over IPC — worker receives undefined. */
  | { readonly strategy: 'absent' };

// ─── Adapter descriptor ─────────────────────────────────────────────────────

/**
 * Full descriptor for one platform adapter.
 * Lives in ADAPTER_REGISTRY — one entry per adapter, one source of truth.
 */
export interface AdapterDescriptor<T> {
  /** Platform-level: wrap with analytics tracking (applied before router). */
  readonly analyticsFactory?: (raw: T, analytics: IAnalytics) => T;
  /** Platform-level: route to concrete backend (LLMRouter, NotifierRouter, etc.). */
  readonly routerFactory?: (raw: T, config: unknown) => T;
  /** Platform-level: wrap with rate limiting / queuing. */
  readonly resourceBrokerFactory?: (raw: T, broker: unknown) => T;
  /**
   * Platform-level: outermost wrap applied after router + queue (e.g. PII redaction).
   * Receives the same per-adapter config as routerFactory.
   */
  readonly postAssemblyFactory?: (raw: T, config: unknown) => T;
  /** Plugin-level: permission enforcement and data isolation. */
  readonly governance: GovernanceDef<T>;
  /** Transport: how this adapter travels across the IPC boundary. */
  readonly ipc: IPCDef<T>;
}
