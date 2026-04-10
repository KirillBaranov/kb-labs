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
      expect(platform.getConfiguredServices().size).toBe(0);
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

  describe('NoOp Fallbacks', () => {
    it('should return NoOp analytics when not configured', () => {
      const analytics = platform.analytics;
      expect(analytics).toBeDefined();
      expect(analytics.track).toBeTypeOf('function');
    });

    it('should return MockLLM when not configured', () => {
      const llm = platform.llm;
      expect(llm).toBeDefined();
      expect(llm.complete).toBeTypeOf('function');
    });

    it('should return MemoryCache when not configured', () => {
      const cache = platform.cache;
      expect(cache).toBeDefined();
      expect(cache.get).toBeTypeOf('function');
      expect(cache.set).toBeTypeOf('function');
    });

    it('should return MemoryVectorStore when not configured', () => {
      const vectorStore = platform.vectorStore;
      expect(vectorStore).toBeDefined();
      expect(vectorStore.search).toBeTypeOf('function');
      expect(vectorStore.upsert).toBeTypeOf('function');
    });

    it('should return configured adapter instead of fallback', () => {
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

    it('should reset to NoOp fallbacks', () => {
      const mockLLM: ILLM = {
        complete: async () => ({ content: 'test', model: 'test', usage: { promptTokens: 10, completionTokens: 5 } }),
        stream: async function* () { yield 'test'; },
      };

      platform.setAdapter('llm', mockLLM);
      platform.reset();

      // Should fallback to MockLLM
      const llm = platform.llm;
      expect(llm).toBeDefined();
      expect(llm).not.toBe(mockLLM);
    });
  });

  describe('Lazy Getters', () => {
    it('should use lazy getter for llm', () => {
      // Before setting adapter
      const llm1 = platform.llm;
      expect(llm1).toBeDefined();

      // Set custom adapter
      const mockLLM: ILLM = {
        complete: async () => ({ content: 'test', model: 'test', usage: { promptTokens: 10, completionTokens: 5 } }),
        stream: async function* () { yield 'test'; },
      };
      platform.setAdapter('llm', mockLLM);

      // After setting adapter
      const llm2 = platform.llm;
      expect(llm2).toBe(mockLLM);
    });

    it('should use lazy getter for cache', () => {
      const cache1 = platform.cache;
      expect(cache1).toBeDefined();

      const mockCache = {
        get: async () => 'cached' as any,
        set: async () => {},
        delete: async () => {},
      } as unknown as ICache;
      platform.setAdapter('cache', mockCache);

      const cache2 = platform.cache;
      expect(cache2).toBe(mockCache);
    });

    it('should use lazy getter for vectorStore', () => {
      const vs1 = platform.vectorStore;
      expect(vs1).toBeDefined();

      const mockVS: IVectorStore = {
        search: async () => [],
        upsert: async () => {},
        delete: async () => {},
        count: async () => 0,
      };
      platform.setAdapter('vectorStore', mockVS);

      const vs2 = platform.vectorStore;
      expect(vs2).toBe(mockVS);
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
