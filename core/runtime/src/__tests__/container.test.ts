/**
 * @module @kb-labs/core-runtime/__tests__/container
 *
 * Tests for PlatformContainer singleton and adapter management.
 *
 * Tests:
 * - Singleton creation with Symbol.for()
 * - Cross-realm singleton behavior
 * - Adapter registration and retrieval
 * - Fallback to NoOp implementations
 * - Core features initialization
 * - Resource broker initialization
 * - Platform reset
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { platform, PlatformContainer } from '../container.js';
import type { ILLM, ICache, IVectorStore } from '@kb-labs/core-platform';

describe('PlatformContainer', () => {
  beforeEach(() => {
    // Reset platform before each test
    platform.reset();
  });

  describe('Singleton Creation', () => {
    it('should create singleton using Symbol.for()', () => {
      // Platform singleton should already exist
      expect(platform).toBeInstanceOf(PlatformContainer);
      expect(platform.setAdapter).toBeTypeOf('function');
      expect(platform.getAdapter).toBeTypeOf('function');
    });

    it('should return same instance across multiple imports', () => {
      const key = Symbol.for('kb.platform');
      const fromProcess = (process as any)[key];

      expect(fromProcess).toBe(platform);
      expect(fromProcess).toBeInstanceOf(PlatformContainer);
    });

    it('should have initial state', () => {
      expect(platform.isInitialized).toBe(false);
      expect(platform.hasResourceBroker).toBe(false);
      // After reset() the container is bootstrap-seeded with a ConsoleLogger
      // so anyone (including initPlatform itself) can log from line one.
      // Everything else is empty until initPlatform() runs.
      expect(platform.getConfiguredServices().size).toBe(1);
      expect(platform.getConfiguredServices().has('logger')).toBe(true);
    });
  });

  describe('Adapter Management', () => {
    it('should set and get adapter', () => {
      const mockLLM: ILLM = {
        complete: async () => ({ content: 'test', model: 'test', usage: { promptTokens: 10, completionTokens: 5 } }),
        stream: async function* () { yield 'test'; },
      };

      platform.setAdapter('llm', mockLLM);

      expect(platform.getAdapter('llm')).toBe(mockLLM);
      expect(platform.hasAdapter('llm')).toBe(true);
    });

    it('should return undefined for non-existent adapter', () => {
      expect(platform.getAdapter('llm')).toBeUndefined();
      expect(platform.hasAdapter('llm')).toBe(false);
    });

    it('should set multiple adapters', () => {
      const mockLLM: ILLM = {
        complete: async () => ({ content: 'test', model: 'test', usage: { promptTokens: 10, completionTokens: 5 } }),
        stream: async function* () { yield 'test'; },
      };

      const mockCache = {
        get: async () => null,
        set: async () => {},
        delete: async () => {},
      } as unknown as ICache;

      platform.setAdapter('llm', mockLLM);
      platform.setAdapter('cache', mockCache);

      expect(platform.getAdapter('llm')).toBe(mockLLM);
      expect(platform.getAdapter('cache')).toBe(mockCache);
      expect(platform.hasAdapter('llm')).toBe(true);
      expect(platform.hasAdapter('cache')).toBe(true);
    });

    it('should replace existing adapter', () => {
      const mockLLM1: ILLM = {
        complete: async () => ({ content: 'v1', model: 'test', usage: { promptTokens: 10, completionTokens: 5 } }),
        stream: async function* () { yield 'v1'; },
      };

      const mockLLM2: ILLM = {
        complete: async () => ({ content: 'v2', model: 'test', usage: { promptTokens: 10, completionTokens: 5 } }),
        stream: async function* () { yield 'v2'; },
      };

      platform.setAdapter('llm', mockLLM1);
      platform.setAdapter('llm', mockLLM2);

      expect(platform.getAdapter('llm')).toBe(mockLLM2);
    });
  });

  describe('Pre-init adapter access', () => {
    // The container no longer synthesises lazy fallbacks inside getters —
    // that's the loader's job (see fillAdapterFallbacksAndRecord). Direct
    // access to a slot before `initPlatform()` returns `undefined`, EXCEPT
    // for `logger` which is bootstrap-seeded so logging works from line one.

    it('returns the bootstrap logger before initPlatform()', () => {
      const logger = platform.logger;
      expect(logger).toBeDefined();
      expect(logger.info).toBeTypeOf('function');
    });

    it('returns undefined-typed for un-seeded slots before initPlatform()', () => {
      // Casting to unknown because the static getter type asserts the value,
      // but the runtime contract before init is "not yet wired".
      expect(platform.analytics as unknown).toBeUndefined();
      expect(platform.llm as unknown).toBeUndefined();
      expect(platform.cache as unknown).toBeUndefined();
      expect(platform.vectorStore as unknown).toBeUndefined();
    });

    it('returns a configured adapter immediately after setAdapter()', () => {
      const mockLLM: ILLM = {
        complete: async () => ({ content: 'custom', model: 'test', usage: { promptTokens: 10, completionTokens: 5 } }),
        stream: async function* () { yield 'custom'; },
      };

      platform.setAdapter('llm', mockLLM);

      expect(platform.llm).toBe(mockLLM);
    });
  });

  describe('Core Features', () => {
    it('should return NoOp core features before initialization', () => {
      expect(platform.isInitialized).toBe(false);
      expect(platform.workflows).toBeDefined();
      expect(platform.jobs).toBeDefined();
      expect(platform.cron).toBeDefined();
      expect(platform.resources).toBeDefined();
    });

    it('should initialize core features', () => {
      const mockWorkflows = {
        execute: async () => {},
        list: async () => [],
      } as any;

      const mockJobs = {
        schedule: async () => {},
        list: async () => [],
      } as any;

      const mockCron = {
        schedule: () => {},
        unschedule: () => {},
      } as any;

      const mockResources = {
        acquire: async () => {},
        release: async () => {},
      } as any;

      platform.initCoreFeatures(mockWorkflows, mockJobs, mockCron, mockResources);

      expect(platform.isInitialized).toBe(true);
      expect(platform.workflows).toBe(mockWorkflows);
      expect(platform.jobs).toBe(mockJobs);
      expect(platform.cron).toBe(mockCron);
      expect(platform.resources).toBe(mockResources);
    });

    it('should include core features in configured services after init', () => {
      const mockWorkflows = { execute: async () => {} } as any;
      const mockJobs = { schedule: async () => {} } as any;
      const mockCron = { schedule: () => {} } as any;
      const mockResources = { acquire: async () => {} } as any;

      platform.initCoreFeatures(mockWorkflows, mockJobs, mockCron, mockResources);

      const services = platform.getConfiguredServices();
      expect(services.has('workflows')).toBe(true);
      expect(services.has('jobScheduler')).toBe(true);
      expect(services.has('cron')).toBe(true);
      expect(services.has('resources')).toBe(true);
    });
  });

  describe('Resource Broker', () => {
    it('should throw error when accessing resourceBroker before init', () => {
      expect(() => platform.resourceBroker).toThrow('ResourceBroker not initialized');
    });

    it('should initialize resource broker', () => {
      const mockBroker = {
        register: () => {},
        acquire: async () => ({ release: async () => {} }),
      } as any;

      platform.initResourceBroker(mockBroker);

      expect(platform.hasResourceBroker).toBe(true);
      expect(platform.resourceBroker).toBe(mockBroker);
    });

    it('should include resourceBroker in configured services after init', () => {
      const mockBroker = { register: () => {} } as any;

      platform.initResourceBroker(mockBroker);

      const services = platform.getConfiguredServices();
      expect(services.has('resourceBroker')).toBe(true);
    });
  });

  describe('Service Configuration Check', () => {
    it('should detect configured adapters', () => {
      const mockLLM: ILLM = {
        complete: async () => ({ content: 'test', model: 'test', usage: { promptTokens: 10, completionTokens: 5 } }),
        stream: async function* () { yield 'test'; },
      };

      platform.setAdapter('llm', mockLLM);

      expect(platform.isConfigured('llm')).toBe(true);
      expect(platform.isConfigured('cache')).toBe(false);
    });

    it('should detect configured core features', () => {
      const mockWorkflows = { execute: async () => {} } as any;
      const mockJobs = { schedule: async () => {} } as any;
      const mockCron = { schedule: () => {} } as any;
      const mockResources = { acquire: async () => {} } as any;

      platform.initCoreFeatures(mockWorkflows, mockJobs, mockCron, mockResources);

      expect(platform.isConfigured('workflows')).toBe(true);
      expect(platform.isConfigured('jobs')).toBe(true);
      expect(platform.isConfigured('jobScheduler')).toBe(true);
    });

    it('should return all configured services', () => {
      const mockLLM: ILLM = {
        complete: async () => ({ content: 'test', model: 'test', usage: { promptTokens: 10, completionTokens: 5 } }),
        stream: async function* () { yield 'test'; },
      };

      platform.setAdapter('llm', mockLLM);
      platform.setAdapter('cache', {} as any);

      const mockWorkflows = { execute: async () => {} } as any;
      const mockJobs = { schedule: async () => {} } as any;
      const mockCron = { schedule: () => {} } as any;
      const mockResources = { acquire: async () => {} } as any;

      platform.initCoreFeatures(mockWorkflows, mockJobs, mockCron, mockResources);

      const services = platform.getConfiguredServices();
      expect(services.has('llm')).toBe(true);
      expect(services.has('cache')).toBe(true);
      expect(services.has('workflows')).toBe(true);
      expect(services.has('jobScheduler')).toBe(true);
      expect(services.has('cron')).toBe(true);
      expect(services.has('resources')).toBe(true);
    });
  });

  describe('Platform Reset', () => {
    it('should clear all adapters', () => {
      const mockLLM: ILLM = {
        complete: async () => ({ content: 'test', model: 'test', usage: { promptTokens: 10, completionTokens: 5 } }),
        stream: async function* () { yield 'test'; },
      };

      platform.setAdapter('llm', mockLLM);
      expect(platform.hasAdapter('llm')).toBe(true);

      platform.reset();

      expect(platform.hasAdapter('llm')).toBe(false);
      expect(platform.getAdapter('llm')).toBeUndefined();
    });

    it('should clear core features', () => {
      const mockWorkflows = { execute: async () => {} } as any;
      const mockJobs = { schedule: async () => {} } as any;
      const mockCron = { schedule: () => {} } as any;
      const mockResources = { acquire: async () => {} } as any;

      platform.initCoreFeatures(mockWorkflows, mockJobs, mockCron, mockResources);
      expect(platform.isInitialized).toBe(true);

      platform.reset();

      expect(platform.isInitialized).toBe(false);
    });

    it('should clear resource broker', () => {
      const mockBroker = { register: () => {} } as any;

      platform.initResourceBroker(mockBroker);
      expect(platform.hasResourceBroker).toBe(true);

      platform.reset();

      expect(platform.hasResourceBroker).toBe(false);
      expect(() => platform.resourceBroker).toThrow('ResourceBroker not initialized');
    });

    it('clears configured adapters back to undefined (but keeps the bootstrap logger)', () => {
      const mockLLM: ILLM = {
        complete: async () => ({ content: 'test', model: 'test', usage: { promptTokens: 10, completionTokens: 5 } }),
        stream: async function* () { yield 'test'; },
      };

      platform.setAdapter('llm', mockLLM);
      platform.reset();

      // LLM was explicitly cleared by reset().
      expect(platform.llm as unknown).toBeUndefined();
      // Logger is re-seeded by reset() — bootstrap invariant.
      expect(platform.logger).toBeDefined();
      expect(platform.logger.info).toBeTypeOf('function');
    });
  });

  describe('Adapter getters', () => {
    it('returns exactly the instance passed to setAdapter() — no wrapping, no lazy synthesis', () => {
      const mockLLM: ILLM = {
        complete: async () => ({ content: 'test', model: 'test', usage: { promptTokens: 10, completionTokens: 5 } }),
        stream: async function* () { yield 'test'; },
      };
      platform.setAdapter('llm', mockLLM);
      expect(platform.llm).toBe(mockLLM);
    });

    it('overwriting via setAdapter() replaces the previous instance', () => {
      const mockCache1 = {
        get: async () => 'a' as never,
        set: async () => {},
        delete: async () => {},
      } as unknown as ICache;
      const mockCache2 = {
        get: async () => 'b' as never,
        set: async () => {},
        delete: async () => {},
      } as unknown as ICache;
      platform.setAdapter('cache', mockCache1);
      platform.setAdapter('cache', mockCache2);
      expect(platform.cache).toBe(mockCache2);
    });

    it('returns undefined for an unset core slot (caller must initPlatform first)', () => {
      const mockVS: IVectorStore = {
        search: async () => [],
        upsert: async () => {},
        delete: async () => {},
        count: async () => 0,
      };
      // vectorStore is unset → undefined
      expect(platform.vectorStore as unknown).toBeUndefined();
      // After setAdapter the same getter returns the real instance.
      platform.setAdapter('vectorStore', mockVS);
      expect(platform.vectorStore).toBe(mockVS);
    });
  });

  describe('Cross-Realm Singleton', () => {
    it('should use Symbol.for() for cross-realm access', () => {
      const key = Symbol.for('kb.platform');
      const fromSymbol = (process as any)[key];

      expect(fromSymbol).toBe(platform);
    });

    it('should store singleton in process object', () => {
      const key = Symbol.for('kb.platform');
      const stored = (process as any)[key];

      expect(stored).toBeInstanceOf(PlatformContainer);
      expect(stored.setAdapter).toBeTypeOf('function');
    });

    it('should maintain singleton across multiple accesses', () => {
      const key = Symbol.for('kb.platform');
      const access1 = (process as any)[key];
      const access2 = (process as any)[key];

      expect(access1).toBe(access2);
      expect(access1).toBe(platform);
    });
  });
});
