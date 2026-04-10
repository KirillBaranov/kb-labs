import { describe, it, expect, afterEach } from 'vitest';
import { platform } from '@kb-labs/core-runtime';
import { setupTestPlatform } from '../setup-platform.js';
import { mockLLM } from '../mock-llm.js';
import { mockCache } from '../mock-cache.js';
import { mockLogger } from '../mock-logger.js';

describe('setupTestPlatform', () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  it('should set LLM adapter in the global singleton', () => {
    const llm = mockLLM();
    const result = setupTestPlatform({ llm });
    cleanup = result.cleanup;

    expect(result.platform).toBe(platform);
    expect(platform.llm).toBe(llm);
  });

  it('should set cache adapter in the global singleton', () => {
    const cache = mockCache();
    const result = setupTestPlatform({ cache });
    cleanup = result.cleanup;

    expect(platform.cache).toBe(cache);
  });

  it('should set logger adapter in the global singleton', () => {
    const logger = mockLogger();
    const result = setupTestPlatform({ logger });
    cleanup = result.cleanup;

    expect(platform.logger).toBe(logger);
  });

  it('should set multiple adapters at once', () => {
    const llm = mockLLM();
    const cache = mockCache();
    const logger = mockLogger();

    const result = setupTestPlatform({ llm, cache, logger });
    cleanup = result.cleanup;

    expect(platform.llm).toBe(llm);
    expect(platform.cache).toBe(cache);
    expect(platform.logger).toBe(logger);
  });

  it('should not set adapters that are not provided', () => {
    const result = setupTestPlatform({ llm: mockLLM() });
    cleanup = result.cleanup;

    // cache should be the fallback from PlatformContainer, not the mock
    expect(platform.hasAdapter('cache')).toBe(false);
  });

  it('cleanup should reset the platform', () => {
    const llm = mockLLM();
    const result = setupTestPlatform({ llm });

    expect(platform.hasAdapter('llm')).toBe(true);

    result.cleanup();
    cleanup = undefined;

    expect(platform.hasAdapter('llm')).toBe(false);
  });

  it('should reset previous state before setting new adapters', () => {
    // First setup — sets llm
    const llm1 = mockLLM();
    setupTestPlatform({ llm: llm1 });
    expect(platform.hasAdapter('llm')).toBe(true);

    // Second setup — should clear llm1, only set cache
    const cache = mockCache();
    const r2 = setupTestPlatform({ cache });
    cleanup = r2.cleanup;

    // llm was cleared by the second setupTestPlatform() reset
    expect(platform.hasAdapter('llm')).toBe(false);
    // cache was set
    expect(platform.cache).toBe(cache);
  });
});
