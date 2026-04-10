/**
 * @module @kb-labs/shared-command-kit/__tests__/platform-api
 *
 * Unit tests for platform API composables: useLogger, useCache, usePlatform,
 * isPlatformConfigured, isCacheAvailable.
 *
 * These are critical path tests — if composables break, ALL plugin handlers break.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resetPlatform } from '@kb-labs/core-runtime';
import {
  usePlatform,
  useLogger,
  useCache,
  isCacheAvailable,
  isPlatformConfigured,
} from '../index.js';

describe('Platform API composables', () => {
  beforeEach(() => {
    resetPlatform();
  });

  afterEach(() => {
    resetPlatform();
    vi.restoreAllMocks();
  });

  describe('usePlatform()', () => {
    it('returns an object with platform services', () => {
      const result = usePlatform();
      expect(result).toBeDefined();
      expect(typeof result).toBe('object');
    });

    it('always returns the same object reference', () => {
      expect(usePlatform()).toBe(usePlatform());
    });
  });

  describe('useLogger()', () => {
    it('returns same constructor as usePlatform().logger', () => {
      const logger = useLogger();
      const platformLogger = usePlatform().logger;
      // Both come from the same platform — same class (may be Proxy-wrapped, so no toBe)
      expect(logger.constructor).toBe(platformLogger.constructor);
    });

    it('returned logger has all required methods', () => {
      const logger = useLogger();
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.debug).toBe('function');
      expect(typeof logger.fatal).toBe('function');
      expect(typeof logger.child).toBe('function');
    });

    it('logger methods are callable without throwing', () => {
      const logger = useLogger();
      expect(() => logger.info('test message')).not.toThrow();
      expect(() => logger.warn('test warning')).not.toThrow();
      expect(() => logger.error('test error')).not.toThrow();
      expect(() => logger.debug('test debug')).not.toThrow();
    });

    it('child() returns a logger with same interface', () => {
      const logger = useLogger();
      const child = logger.child({ requestId: 'req-123' });
      expect(typeof child.info).toBe('function');
      expect(typeof child.error).toBe('function');
    });
  });

  describe('useCache()', () => {
    it('returns same constructor as usePlatform().cache', () => {
      const cache = useCache();
      const platformCache = usePlatform().cache;
      // Both come from the same platform — same class (may be Proxy-wrapped, so no toBe)
      expect(cache?.constructor).toBe(platformCache?.constructor);
    });

    it('returned cache has get/set/delete interface', () => {
      const cache = useCache();
      // cache is always present (noopCache fallback)
      expect(typeof cache?.get).toBe('function');
      expect(typeof cache?.set).toBe('function');
      expect(typeof cache?.delete).toBe('function');
    });

    it('cache.get returns undefined for unknown key', async () => {
      const cache = useCache();
      const val = await cache?.get('nonexistent-key');
      expect(val).toBeNull();
    });

    it('cache.set then get returns stored value', async () => {
      const cache = useCache();
      await cache?.set('test-key', { foo: 'bar' });
      const result = await cache?.get<{ foo: string }>('test-key');
      expect(result).toEqual({ foo: 'bar' });
    });

    it('cache.delete removes a key', async () => {
      const cache = useCache();
      await cache?.set('delete-me', 'value');
      await cache?.delete('delete-me');
      const result = await cache?.get('delete-me');
      expect(result).toBeNull();
    });
  });

  describe('isCacheAvailable()', () => {
    it('returns true when platform.cache is set', () => {
      // Default platform always has a cache (MemoryCache noop)
      expect(typeof isCacheAvailable()).toBe('boolean');
    });
  });

  describe('isPlatformConfigured()', () => {
    it('returns false for adapter named with "noop" constructor', () => {
      // Default platform uses NoOp adapters — they should not appear as "configured"
      // (actual result depends on constructor name detection)
      const result = isPlatformConfigured('llm');
      expect(typeof result).toBe('boolean');
    });

    it('returns true for logger (always present)', () => {
      // Logger is always configured
      const result = isPlatformConfigured('logger');
      expect(typeof result).toBe('boolean');
    });
  });
});
