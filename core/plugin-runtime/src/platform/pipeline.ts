/**
 * Platform adapter pipeline.
 *
 * Two phases:
 *   1. assemblePlatform()       — system-level: broker → analytics → router → PII (once at startup)
 *   2. applyPluginGovernance()  — per-plugin: adapter middlewares → governance (per context)
 */

import type { PlatformServices, PluginServices, PermissionSpec } from '@kb-labs/plugin-contracts';
import type { IResourceBroker } from '@kb-labs/core-resource-broker';
import { ADAPTER_REGISTRY } from './adapter-registry.js';
import type { AdapterLifecycle, AdapterMiddlewareFn } from './middleware.js';
import type { AdapterMiddlewareDecl } from './pipeline-slots.js';
import { SLOT_ORDER } from './pipeline-slots.js';

// ─── Diagnostic logger interface ─────────────────────────────────────────────

/** Minimal logger shape required for diagnostic emission. Structurally compatible with ILogger. */
interface DiagLogger {
  debug(msg: string, meta?: Record<string, unknown>): void;
}

// ─── Platform config ─────────────────────────────────────────────────────────

/**
 * Per-adapter router configuration, keyed by adapter name.
 * Passed to `routerFactory` when building the platform-level pipeline.
 */
export type PlatformConfig = Partial<Record<keyof PlatformServices, unknown>>;

// ─── Loaded middleware ────────────────────────────────────────────────────────

/**
 * A resolved adapter middleware, ready to be applied in the pipeline.
 * Loader resolves the handler module and populates this from AdapterMiddlewareDecl.
 */
export interface LoadedMiddleware {
  /** Source declaration (from AdapterManifest). */
  readonly decl: AdapterMiddlewareDecl;
  /** Resolved wrap function. */
   
  readonly fn: AdapterMiddlewareFn<any>;
}

// ─── No-op lifecycle (used when no lifecycle hooks are needed) ────────────────

const NOOP_LIFECYCLE: AdapterLifecycle = {
  onReady: () => {},
  onDispose: () => {},
  on: () => {},
};

// ─── Phase 1: system-level assembly ──────────────────────────────────────────

/**
 * Build the platform-level pipeline for all adapters (once at startup).
 *
 * Applies four factory stages from ADAPTER_REGISTRY in order, for each adapter:
 *   1. resourceBrokerFactory — innermost: rate limiting / queuing (e.g. QueuedLLM)
 *   2. analyticsFactory      — wraps queue so tracking fires before enqueue
 *   3. routerFactory         — outermost routing layer (e.g. LLMRouter with tier dispatch)
 *   4. postAssemblyFactory   — outermost wrap (e.g. PII redaction)
 *
 * Stage order rationale: QueuedLLM.complete() routes through broker.enqueue() → executor,
 * NOT through this.realLLM. The executor is registered before assembly with the raw adapter.
 * If analytics/router wrap the raw adapter BEFORE QueuedLLM wraps them, those wrappers
 * are bypassed for complete() calls (executor captures raw). By making broker innermost,
 * analytics and router correctly intercept every call before it reaches the queue.
 *
 * Analytics instance is taken from `raw.analytics` — set it in the container
 * before calling this function.
 *
 * The result is a fully assembled PlatformServices that can be passed to
 * `applyPluginGovernance()` for each plugin.
 *
 * @param raw     - Raw platform services (analytics must already be set)
 * @param config  - Per-adapter config keyed by adapter name
 * @param broker  - ResourceBroker instance for rate limiting / queuing
 */
export function assemblePlatform(
  raw: PlatformServices,
  config: PlatformConfig,
  broker: IResourceBroker,
  diagLogger?: DiagLogger,
): PlatformServices {
  const result = Object.fromEntries(
    (Object.keys(ADAPTER_REGISTRY) as Array<keyof PlatformServices>).map(key => [key, raw[key]])
  ) as unknown as PlatformServices;
  const analytics = raw.analytics;

  const trace: Array<{ adapter: string; stage: string; applied: boolean }> = [];

  for (const key of Object.keys(ADAPTER_REGISTRY) as Array<keyof PlatformServices>) {
    const def = ADAPTER_REGISTRY[key as keyof typeof ADAPTER_REGISTRY];
    let adapter = result[key] as unknown;
    if (adapter === undefined) { continue; }

    const adapterKey = String(key);

    // Applies one factory stage: runs it if condition is true, records to trace when diagLogger is set.
    const applyStage = (stage: string, condition: boolean, apply: () => unknown): void => {
      if (condition) { adapter = apply(); }
      if (diagLogger) { trace.push({ adapter: adapterKey, stage, applied: condition }); }
    };

    // Stage 1: resource broker (innermost — executor captures raw adapter at registration time)
    applyStage('resourceBrokerFactory',
      'resourceBrokerFactory' in def && !!def.resourceBrokerFactory,
      () => (def.resourceBrokerFactory as (r: unknown, b: unknown) => unknown)(adapter, broker));

    // Stage 2: analytics (wraps queue so tracking fires for every complete() call)
    applyStage('analyticsFactory',
      'analyticsFactory' in def && !!def.analyticsFactory && !!analytics,
      () => (def.analyticsFactory as (r: unknown, a: unknown) => unknown)(adapter, analytics));

    // Stage 3: router (e.g. LLMRouter injects tier/provider metadata seen by analytics)
    applyStage('routerFactory',
      'routerFactory' in def && !!def.routerFactory && config[key] !== undefined,
      () => (def.routerFactory as (r: unknown, c: unknown) => unknown)(adapter, config[key]));

    // Stage 4: outermost wrap (e.g. PII redaction)
    applyStage('postAssemblyFactory',
      'postAssemblyFactory' in def && !!def.postAssemblyFactory && config[key] !== undefined,
      () => (def.postAssemblyFactory as (r: unknown, c: unknown) => unknown)(adapter, config[key]));

    (result as unknown as Record<string, unknown>)[key] = adapter;
  }

  if (process.env.KB_DEBUG === 'true' && diagLogger !== undefined) {
    diagLogger.debug('kb.diag.pipeline', {
      event: 'kb.diag.pipeline',
      v: 1,
      data: trace,
      ts: Date.now(),
    });
  }

  return result;
}

// ─── Phase 2: per-plugin governance ──────────────────────────────────────────

/**
 * Apply plugin-level governance to an already-assembled platform.
 *
 * Builds a middleware chain per adapter:
 *   1. System governance from ADAPTER_REGISTRY (always last — 'governance' slot)
 *   2. Adapter-provided middlewares sorted by slot order, then local priority
 *
 * @param platform         - Assembled platform (output of assemblePlatform)
 * @param permissions      - Plugin's declared permissions
 * @param pluginId         - Plugin ID (used in logger child + notifier source override)
 * @param adapterMiddlewares - Resolved middlewares from loaded adapter manifests
 * @param lifecycle        - Lifecycle hooks (onReady/onDispose/on) for this plugin instance
 */
export function applyPluginGovernance(
  platform: PlatformServices,
  permissions: PermissionSpec,
  pluginId: string,
  adapterMiddlewares: LoadedMiddleware[] = [],
  lifecycle: AdapterLifecycle = NOOP_LIFECYCLE,
  diagLogger?: DiagLogger,
): PluginServices {
  const ctx = { permissions, pluginId, lifecycle };
  // Only keys in ADAPTER_REGISTRY are included — platform-only fields (not in the registry)
  // are automatically excluded, enforcing the PlatformServices → PluginServices boundary.
  const result = Object.fromEntries(
    (Object.keys(ADAPTER_REGISTRY) as Array<keyof PluginServices>).map(key => [key, platform[key as keyof PlatformServices]])
  ) as unknown as PluginServices;

  for (const key of Object.keys(ADAPTER_REGISTRY) as Array<keyof PluginServices>) {
    const def = ADAPTER_REGISTRY[key as keyof typeof ADAPTER_REGISTRY];
    let adapter = result[key] as unknown;
    if (adapter === undefined) {continue;}

    // Collect adapter-provided middlewares that target this adapter key
    const adapterMws = adapterMiddlewares
      .filter((mw) => mw.decl.target === key)
      .sort((a, b) => {
        const slotA = SLOT_ORDER.indexOf((a.decl.slot ?? 'post-resource-broker') as typeof SLOT_ORDER[number]);
        const slotB = SLOT_ORDER.indexOf((b.decl.slot ?? 'post-resource-broker') as typeof SLOT_ORDER[number]);
        if (slotA !== slotB) {return slotA - slotB;}
        return (a.decl.priority ?? 0) - (b.decl.priority ?? 0);
      });

    // Apply adapter-provided middlewares first (pre-governance)
    for (const mw of adapterMws) {
      adapter = mw.fn(adapter, ctx);
    }

    // Apply system governance last (always in 'governance' slot)
    if (def.governance.strategy === 'wrap') {
      adapter = (def.governance.fn as AdapterMiddlewareFn<unknown>)(adapter, ctx);
    }
    // 'pass-through' → adapter unchanged

    (result as unknown as Record<string, unknown>)[key] = adapter;

    if (process.env.KB_DEBUG === 'true' && diagLogger !== undefined) {
      diagLogger.debug('kb.diag.governance', {
        event: 'kb.diag.governance',
        v: 1,
        data: {
          adapter: key,
          pluginId,
          middlewaresApplied: adapterMws.map(mw => ({
            name: mw.decl.id,
            slot: mw.decl.slot ?? 'post-resource-broker',
            priority: mw.decl.priority ?? 0,
          })),
          governanceStrategy: def.governance.strategy,
        },
        ts: Date.now(),
      });
    }
  }

  return result;
}
