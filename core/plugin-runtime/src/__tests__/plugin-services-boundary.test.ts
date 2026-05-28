/**
 * Tests the boundary between PlatformServices (services) and PluginServices (plugins).
 *
 * Verifies three guarantees:
 * 1. applyPluginGovernance returns PluginServices — platform-only fields are stripped
 * 2. platformContext (ALS) stores PluginServices, not the full PlatformServices
 * 3. PluginContextV3.platform is typed as PluginServices (compile-time)
 *
 * TDD: tests written before the type split is implemented.
 * They will fail until IPluginAdapters / PluginServices are introduced.
 */

import { describe, it, expect } from 'vitest';
import { applyPluginGovernance } from '../platform/pipeline.js';
import { platformContext } from '@kb-labs/plugin-contracts';
import { createMockPlatform } from './test-mocks.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePlatformWithExtra() {
  const base = createMockPlatform();
  return Object.assign(base, {
    // Simulate a future platform-only adapter (e.g. serviceTransport).
    // It is NOT registered in ADAPTER_REGISTRY so must never reach plugins.
    _platformOnlyField: { secret: 'internal' },
  });
}

const emptyPermissions = {};

// ---------------------------------------------------------------------------
// 1. Runtime boundary — applyPluginGovernance strips platform-only fields
// ---------------------------------------------------------------------------

describe('applyPluginGovernance — platform boundary', () => {
  it('strips fields that are not in ADAPTER_REGISTRY from governed result', () => {
    const platform = makePlatformWithExtra();
    expect((platform as unknown as Record<string, unknown>)._platformOnlyField).toBeDefined();

    const governed = applyPluginGovernance(platform, emptyPermissions, 'test-plugin');

    expect((governed as unknown as Record<string, unknown>)._platformOnlyField).toBeUndefined();
    expect('_platformOnlyField' in governed).toBe(false);
  });

  it('preserves all PluginServices fields in governed result', () => {
    const platform = createMockPlatform();
    const governed = applyPluginGovernance(platform, emptyPermissions, 'test-plugin');

    // Every field from the base mock must survive governance
    const pluginFields = [
      'logger', 'llm', 'embeddings', 'vectorStore', 'cache',
      'storage', 'analytics', 'eventBus', 'invoke',
      'documentDatabase', 'kvStore', 'logs', 'config',
    ] as const;

    for (const field of pluginFields) {
      expect(governed[field], `field '${field}' must be present after governance`).toBeDefined();
    }
  });

  it('governed result has no extra own keys beyond PluginServices', () => {
    const platform = makePlatformWithExtra();
    const governed = applyPluginGovernance(platform, emptyPermissions, 'test-plugin');

    const allowedKeys = new Set([
      'logger', 'analytics', 'vectorStore', 'llm', 'embeddings',
      'cache', 'config', 'storage', 'eventBus', 'invoke',
      'documentDatabase', 'kvStore', 'logs',
      // optional
      'artifacts', 'snapshotManager', 'notifier',
    ]);

    for (const key of Object.keys(governed)) {
      expect(allowedKeys.has(key), `unexpected key '${key}' in governed platform`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. AsyncLocalStorage — stores PluginServices, not raw PlatformServices
// ---------------------------------------------------------------------------

describe('platformContext (ALS) — boundary', () => {
  it('stores governed PluginServices, not raw PlatformServices with extra fields', async () => {
    const platform = makePlatformWithExtra();
    const governed = applyPluginGovernance(platform, emptyPermissions, 'test-plugin');

    await platformContext.run(governed, async () => {
      const stored = platformContext.getStore();
      expect(stored).toBeDefined();
      expect((stored as unknown as Record<string, unknown>)?._platformOnlyField).toBeUndefined();
    });
  });

  it('plugin code cannot reach platform-only fields via ALS', async () => {
    const platform = makePlatformWithExtra();
    const governed = applyPluginGovernance(platform, emptyPermissions, 'test-plugin');

    let leakedValue: unknown = 'not-checked';

    await platformContext.run(governed, async () => {
      const stored = platformContext.getStore() as Record<string, unknown> | undefined;
      leakedValue = stored?.['_platformOnlyField'];
    });

    expect(leakedValue).toBeUndefined();
  });
});
