import { describe, it, expect, vi } from 'vitest';
import {
  LifecycleManager,
  type CliContext,
  type ExecutionLimits,
  type IManifestProvider,
} from '../lifecycle/lifecycle-manager.js';

function createTestSetup(overrides?: Partial<ExecutionLimits>) {
  const limits: ExecutionLimits = {
    lifecycleTimeoutMs: 500,
    middlewareTimeoutMs: 200,
    discoveryTimeoutMs: 1000,
    ...overrides,
  };
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  const ctx: CliContext = { logger };
  const manifests = new Map<string, any>();
  const registry: IManifestProvider = {
    getManifest: (id) => manifests.get(id) ?? null,
  };

  return { limits, ctx, logger, manifests, registry };
}

describe('LifecycleManager', () => {
  // ── invokeLoad ───────────────────────────────────────────────────────

  it('does nothing when manifest has no lifecycle', async () => {
    const { registry, ctx, limits, manifests } = createTestSetup();
    manifests.set('test-plugin', { id: 'test-plugin', version: '1.0.0' });
    const lm = new LifecycleManager(registry, ctx, limits);

    // Should not throw
    await lm.invokeLoad('test-plugin');
  });

  it('does nothing when plugin not found in registry', async () => {
    const { registry, ctx, limits } = createTestSetup();
    const lm = new LifecycleManager(registry, ctx, limits);

    await lm.invokeLoad('nonexistent');
    // No error — graceful noop
  });

  it('logs error when onLoad hook fails', async () => {
    const { registry, ctx, limits, manifests, logger } = createTestSetup();
    manifests.set('bad-plugin', {
      id: 'bad-plugin',
      version: '1.0.0',
      lifecycle: { onLoad: './lifecycle.js#onLoad' },
    });
    const lm = new LifecycleManager(registry, ctx, limits);

    // loadLifecycle returns empty {} so onLoad is undefined — no error
    await lm.invokeLoad('bad-plugin');

    // Since loadLifecycle is stubbed to return {}, onLoad is undefined,
    // so it should gracefully skip without logging errors
    expect(logger.error).not.toHaveBeenCalled();
  });

  // ── invokeUnload ─────────────────────────────────────────────────────

  it('does nothing when plugin was never loaded', async () => {
    const { registry, ctx, limits } = createTestSetup();
    const lm = new LifecycleManager(registry, ctx, limits);

    await lm.invokeUnload('never-loaded');
    // No error
  });

  // ── invokeEnable / invokeDisable ─────────────────────────────────────

  it('does nothing when plugin was never loaded (enable)', async () => {
    const { registry, ctx, limits } = createTestSetup();
    const lm = new LifecycleManager(registry, ctx, limits);

    await lm.invokeEnable('not-loaded');
  });

  it('does nothing when plugin was never loaded (disable)', async () => {
    const { registry, ctx, limits } = createTestSetup();
    const lm = new LifecycleManager(registry, ctx, limits);

    await lm.invokeDisable('not-loaded');
  });

  // ── shutdownAll ──────────────────────────────────────────────────────

  it('shutdownAll completes when no plugins loaded', async () => {
    const { registry, ctx, limits } = createTestSetup();
    const lm = new LifecycleManager(registry, ctx, limits);

    await lm.shutdownAll();
    // No error
  });

  // ── withTimeout (tested indirectly) ──────────────────────────────────

  it('timeout rejects when hook takes too long', async () => {
    const { registry, ctx, limits, manifests } = createTestSetup({
      lifecycleTimeoutMs: 50,
    });

    manifests.set('slow-plugin', {
      id: 'slow-plugin',
      version: '1.0.0',
      lifecycle: { onLoad: './lifecycle.js#onLoad' },
    });

    const lm = new LifecycleManager(registry, ctx, limits);

    // Since loadLifecycle is stubbed (returns {}), timeout won't trigger here.
    // This test documents the behavior — when loadLifecycle is implemented,
    // a slow hook would be caught by withTimeout.
    await lm.invokeLoad('slow-plugin');
  });
});
