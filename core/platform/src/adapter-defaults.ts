/**
 * @module @kb-labs/core-platform/adapter-defaults
 *
 * Per-slot default fallback policy for the platform adapter pipeline.
 *
 * When `kb.config.json` does NOT configure an adapter for a slot, the
 * platform loader consults this table to decide between:
 *
 * - `'inmemory'` — instantiate a working, honest in-process implementation
 *   from `@kb-labs/core-platform/inmemory`. Operations behave correctly;
 *   data lives only for the lifetime of the process.
 *
 * - `'noop'` — instantiate a stub that throws `AdapterUnavailableError` on
 *   every functional operation. Used for slots where an honest fallback is
 *   impossible (e.g. LLM — no way to fake model output without lying to
 *   the caller).
 *
 * **A configured adapter that fails to load is NEVER auto-degraded** —
 * that's a fail-fast condition handled by the loader, not this table.
 * This table only governs the "slot was left blank" case.
 *
 * The `satisfies Record<AdapterSlot, ...>` clause is intentional: if a new
 * slot is added to `IPlatformAdapters` without a corresponding entry here,
 * this file fails to compile. That keeps the table in sync with the
 * adapter surface without manual review.
 */

import type { IPluginAdapters } from './platform-adapters.js';

/**
 * Union of every plugin-visible adapter slot.
 *
 * Covers IPluginAdapters only — platform-only adapters (e.g. serviceTransport)
 * are intentionally excluded: they have no inmemory/noop fallback and are never
 * managed by the plugin runtime.
 */
export type AdapterSlot = keyof IPluginAdapters;

/**
 * Default fallback choice when a slot is not configured.
 *
 * - `'inmemory'` — InMemory implementation will be instantiated.
 * - `'noop'`     — NoOp stub that throws `AdapterUnavailableError`.
 */
export type DefaultFallbackMode = 'inmemory' | 'noop';

export interface AdapterDefault {
  defaultFallback: DefaultFallbackMode;
}

/**
 * Default fallback policy per slot.
 *
 * Adding a new slot to `IPlatformAdapters` without adding an entry here
 * triggers a compile-time error from the `satisfies` clause.
 */
export const ADAPTER_DEFAULTS = {
  // ── Honest in-memory implementations (work in single-process) ────────────
  logger:           { defaultFallback: 'inmemory' },
  cache:            { defaultFallback: 'inmemory' },
  storage:          { defaultFallback: 'inmemory' },
  eventBus:         { defaultFallback: 'inmemory' },
  vectorStore:      { defaultFallback: 'inmemory' },
  documentDatabase: { defaultFallback: 'inmemory' },
  kvStore:          { defaultFallback: 'inmemory' },
  invoke:           { defaultFallback: 'inmemory' },
  artifacts:        { defaultFallback: 'inmemory' },
  config:           { defaultFallback: 'inmemory' },
  analytics:        { defaultFallback: 'inmemory' },

  // ── No honest fallback possible — throw on use ───────────────────────────
  llm:              { defaultFallback: 'noop' },
  embeddings:       { defaultFallback: 'noop' },
  notifier:         { defaultFallback: 'noop' },
  logs:             { defaultFallback: 'noop' },
  snapshotManager:  { defaultFallback: 'noop' },
} as const satisfies Record<AdapterSlot, AdapterDefault>;
