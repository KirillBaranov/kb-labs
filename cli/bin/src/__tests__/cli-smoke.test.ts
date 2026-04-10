/**
 * @module @kb-labs/cli-bin/__tests__/cli-smoke
 *
 * Smoke tests for CLI - just verify it doesn't crash.
 * Simple sanity checks.
 */

import { describe, it, expect } from 'vitest';
import { initPlatform, resetPlatform } from '@kb-labs/core-runtime';
import { platform } from '@kb-labs/core-runtime';

describe('CLI Smoke Tests', () => {
  it('should initialize platform without crashing', async () => {
    resetPlatform();
    await initPlatform({});

    expect(platform.isInitialized).toBe(true);
  });

  it('should have core platform features', async () => {
    resetPlatform();
    await initPlatform({});

    // Critical adapters should work
    expect(platform.llm).toBeDefined();
    expect(platform.cache).toBeDefined();
    expect(platform.storage).toBeDefined();
  });

  it('should handle reset and re-init', async () => {
    await initPlatform({});
    resetPlatform();
    await initPlatform({});

    expect(platform.isInitialized).toBe(true);
  });

  it('should be idempotent', async () => {
    const first = await initPlatform({});
    const second = await initPlatform({});

    expect(first).toBe(second);
    expect(first).toBe(platform);
  });
});
