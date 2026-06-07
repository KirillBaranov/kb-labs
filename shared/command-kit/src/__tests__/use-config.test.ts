/**
 * @module @kb-labs/shared-command-kit/__tests__/use-config
 *
 * Tests for `useConfig` reading the loaded config global directly.
 *
 * Regression guard for the "F2" bug: previously `useConfig` routed through the
 * `platform.config` adapter, which is undefined on the isolated/worker handler
 * path (config is attached post-assembly only on the parent path) — so config
 * reads crashed / returned undefined there even though the service had loaded
 * the config. `useConfig` now reads `__KB_EFFECTIVE_CONFIG__` /
 * `__KB_RAW_CONFIG__` (set by `service-bootstrap`) directly and slices by
 * section, with the adapter kept only as a remote fallback.
 */

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { useConfig } from '../index.js';

// Simulate the F2 path: a platform whose `config` adapter is undefined
// (isolated/worker handler). Old code did `platform.config.getConfig(...)` and
// threw a TypeError here; the fix reads the global first and never touches it.
vi.mock('../helpers/use-platform.js', () => ({
  usePlatform: () => ({ config: undefined }),
}));

type ConfigGlobal = typeof globalThis & {
  __KB_RAW_CONFIG__?: Record<string, unknown>;
  __KB_EFFECTIVE_CONFIG__?: Record<string, unknown>;
  __KB_CONFIG_SECTION__?: string;
};

const g = globalThis as ConfigGlobal;

function clearGlobals() {
  delete g.__KB_RAW_CONFIG__;
  delete g.__KB_EFFECTIVE_CONFIG__;
  delete g.__KB_CONFIG_SECTION__;
}

describe('useConfig — reads the loaded config global directly', () => {
  beforeEach(clearGlobals);
  afterEach(clearGlobals);

  it('reads a product section from the Profiles v2 global (no platform needed)', async () => {
    // This is the F2 case: no platform.config adapter involved at all.
    g.__KB_RAW_CONFIG__ = {
      profiles: [
        { id: 'default', products: { workflow: { maxConcurrency: 10 } } },
      ],
    };

    const cfg = await useConfig<{ maxConcurrency: number }>('workflow');
    expect(cfg).toEqual({ maxConcurrency: 10 });
  });

  it('prefers __KB_EFFECTIVE_CONFIG__ (overlays applied) over __KB_RAW_CONFIG__', async () => {
    g.__KB_RAW_CONFIG__ = {
      profiles: [{ id: 'default', products: { workflow: { maxConcurrency: 1 } } }],
    };
    g.__KB_EFFECTIVE_CONFIG__ = {
      profiles: [{ id: 'default', products: { workflow: { maxConcurrency: 99 } } }],
    };

    const cfg = await useConfig<{ maxConcurrency: number }>('workflow');
    expect(cfg).toEqual({ maxConcurrency: 99 });
  });

  it('selects by explicit profileId', async () => {
    g.__KB_EFFECTIVE_CONFIG__ = {
      profiles: [
        { id: 'default', products: { workflow: { maxConcurrency: 1 } } },
        { id: 'production', products: { workflow: { maxConcurrency: 50 } } },
      ],
    };

    const cfg = await useConfig<{ maxConcurrency: number }>('workflow', 'production');
    expect(cfg).toEqual({ maxConcurrency: 50 });
  });

  it('reads the legacy flat structure with the mind → knowledge alias', async () => {
    g.__KB_EFFECTIVE_CONFIG__ = {
      knowledge: { scopes: ['a', 'b'] },
    };

    const cfg = await useConfig<{ scopes: string[] }>('mind');
    expect(cfg).toEqual({ scopes: ['a', 'b'] });
  });

  it('auto-detects the product from __KB_CONFIG_SECTION__', async () => {
    g.__KB_CONFIG_SECTION__ = 'workflow';
    g.__KB_EFFECTIVE_CONFIG__ = {
      profiles: [{ id: 'default', products: { workflow: { maxConcurrency: 7 } } }],
    };

    const cfg = await useConfig<{ maxConcurrency: number }>();
    expect(cfg).toEqual({ maxConcurrency: 7 });
  });

  it('returns undefined when the section is absent from the loaded global', async () => {
    g.__KB_EFFECTIVE_CONFIG__ = {
      profiles: [{ id: 'default', products: { workflow: {} } }],
    };

    const cfg = await useConfig('nonexistent');
    expect(cfg).toBeUndefined();
  });

  it('returns undefined when no product can be resolved', async () => {
    g.__KB_EFFECTIVE_CONFIG__ = { profiles: [] };
    const cfg = await useConfig();
    expect(cfg).toBeUndefined();
  });

  // Decisive fail-before/pass-after for F2: even when the platform.config
  // adapter is undefined (worker handler), useConfig still resolves the section
  // from the loaded global instead of crashing.
  it('resolves from the global even when platform.config is undefined (F2)', async () => {
    g.__KB_EFFECTIVE_CONFIG__ = {
      profiles: [{ id: 'default', products: { workflow: { maxConcurrency: 3 } } }],
    };

    const cfg = await useConfig<{ maxConcurrency: number }>('workflow');
    expect(cfg).toEqual({ maxConcurrency: 3 });
  });
});
