/**
 * @module @kb-labs/core-runtime/adapter-status
 *
 * Adapter status registry. Records the mode (real / inmemory / noop) of
 * every platform adapter slot picked up by `initPlatform()`, so operators
 * can inspect what the platform is actually running with.
 *
 * The loader writes to this registry once per slot during startup;
 * `getAdapterStatus()` is the read API. Plugins consume the same data via
 * the `useAdapterStatus()` SDK hook; the gateway publishes it at
 * `/health/adapters`; `kb-dev doctor` polls that endpoint.
 *
 * Storage: global singleton on `globalThis` via `Symbol.for(...)`, the same
 * cross-realm pattern used by the platform container singleton in
 * `container.ts`. `resetAdapterStatus()` clears it and is called from
 * `resetPlatform()` so test runs stay hermetic.
 */

import type { AdapterSlot } from '@kb-labs/core-platform';

/**
 * Whether the slot is backed by a real configured adapter, an honest
 * in-process implementation, or a fail-loud NoOp stub.
 */
export type AdapterMode = 'real' | 'inmemory' | 'noop';

/**
 * Why the slot ended up in its current mode. Only meaningful when
 * `mode !== 'real'`. Single value today; reserved as a union for future
 * additions like `'load-failed'` if we ever allow soft-failure.
 */
export type AdapterStatusReason = 'not-configured';

export interface AdapterSlotStatus {
  /** Slot key, e.g. 'llm', 'cache', 'documentDatabase'. */
  slot: AdapterSlot;
  /** Real / inmemory / noop. */
  mode: AdapterMode;
  /**
   * Implementation identifier — package id for real adapters
   * (e.g. `'@kb-labs/adapters-sqlite'`), class name for fallbacks
   * (e.g. `'InMemoryCache'`, `'NoOpLLM'`).
   */
  implementation: string;
  /**
   * What the user wrote in `kb.config.json` (`adapters[slot]`), if anything.
   * Useful for diagnostics: "configured but fell back" should never happen
   * by policy, but recording the configured value makes audits cheap.
   */
  configuredPackage?: string;
  /** Why `mode !== 'real'`. */
  reason?: AdapterStatusReason;
  /** ISO timestamp of the record. */
  recordedAt: string;
}

/**
 * Mutable view of the registry — only the loader should call `record()`.
 */
export interface AdapterStatusRegistry {
  record(status: AdapterSlotStatus): void;
  get(slot: AdapterSlot): AdapterSlotStatus | undefined;
  list(): AdapterSlotStatus[];
  clear(): void;
}

const REGISTRY_KEY = Symbol.for('kb.adapter-status');

type GlobalWithRegistry = typeof globalThis & {
  [REGISTRY_KEY]?: Map<AdapterSlot, AdapterSlotStatus>;
};

function getStore(): Map<AdapterSlot, AdapterSlotStatus> {
  const g = globalThis as GlobalWithRegistry;
  let store = g[REGISTRY_KEY];
  if (!store) {
    store = new Map();
    g[REGISTRY_KEY] = store;
  }
  return store;
}

/**
 * Read-write handle on the global registry. Loader uses `record()`;
 * everything else should prefer `getAdapterStatus()` / `getAdapterStatusFor()`.
 */
export function getAdapterStatusRegistry(): AdapterStatusRegistry {
  const store = getStore();
  return {
    record(status: AdapterSlotStatus): void {
      store.set(status.slot, status);
    },
    get(slot: AdapterSlot): AdapterSlotStatus | undefined {
      return store.get(slot);
    },
    list(): AdapterSlotStatus[] {
      return [...store.values()];
    },
    clear(): void {
      store.clear();
    },
  };
}

/**
 * Snapshot of the current adapter status across all slots. Empty array
 * means `initPlatform()` has not run yet (or `resetAdapterStatus()` was
 * called and no init has happened since).
 */
export function getAdapterStatus(): AdapterSlotStatus[] {
  return getAdapterStatusRegistry().list();
}

/**
 * Look up the status of a single slot.
 */
export function getAdapterStatusFor(slot: AdapterSlot): AdapterSlotStatus | undefined {
  return getAdapterStatusRegistry().get(slot);
}

/**
 * Clear all recorded statuses. Called from `resetPlatform()` so tests
 * that re-run `initPlatform()` see fresh state, never stale records
 * from a previous test.
 */
export function resetAdapterStatus(): void {
  getAdapterStatusRegistry().clear();
}
