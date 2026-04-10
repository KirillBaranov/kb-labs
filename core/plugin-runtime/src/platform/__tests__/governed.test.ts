/**
 * Tests for governed platform services
 * Validates permission enforcement and interface completeness
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createGovernedPlatformServices } from '../governed';
import type { PlatformServices, PermissionSpec } from '@kb-labs/plugin-contracts';
import { PermissionError } from '@kb-labs/plugin-contracts';

// Mock platform services
function createMockPlatformServices(): PlatformServices {
  return {
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      child: vi.fn((_context) => createMockPlatformServices().logger),
    } as any,

    llm: {
      complete: vi.fn(async (_prompt, options) => ({
        content: 'mock response',
        usage: { promptTokens: 10, completionTokens: 20 },
        model: options?.model || 'gpt-4o-mini',
      })),
      stream: vi.fn(async function* (_prompt, _options) {
        yield 'mock';
        yield ' response';
      }),
    } as any,

    embeddings: {
      embed: vi.fn(async (_text) => [0.1, 0.2, 0.3]),
      embedBatch: vi.fn(async (texts) => texts.map(() => [0.1, 0.2, 0.3])),
      dimensions: 1536,
      getDimensions: vi.fn(async () => 1536),
    } as any,

    vectorStore: {
      search: vi.fn(async () => []),
      upsert: vi.fn(async () => {}),
      delete: vi.fn(async () => {}),
      count: vi.fn(async () => 0),
    } as any,

    cache: {
      get: vi.fn(async () => null),
      set: vi.fn(async () => {}),
      delete: vi.fn(async () => {}),
      clear: vi.fn(async () => {}),
      zadd: vi.fn(async () => {}),
      zrangebyscore: vi.fn(async () => []),
      zrem: vi.fn(async () => {}),
      setIfNotExists: vi.fn(async () => true),
    } as any,

    storage: {
      read: vi.fn(async () => Buffer.from('test')),
      write: vi.fn(async () => {}),
      delete: vi.fn(async () => {}),
      exists: vi.fn(async () => true),
      list: vi.fn(async () => []),
    } as any,

    analytics: {
      track: vi.fn(async () => {}),
    } as any,

    eventBus: {
      publish: vi.fn(async () => {}),
      subscribe: vi.fn(() => () => {}),
    } as any,

    logs: {
      query: vi.fn(async () => ({ logs: [], total: 0, hasMore: false, source: 'buffer' as const })),
      getById: vi.fn(async () => null),
      search: vi.fn(async () => ({ logs: [], total: 0, hasMore: false })),
      subscribe: vi.fn(() => () => {}),
      getStats: vi.fn(async () => ({})),
      getCapabilities: vi.fn(() => ({ hasBuffer: false, hasPersistence: false, hasSearch: false, hasStreaming: false })),
    } as any,
  };
}

describe('createGovernedPlatformServices', () => {
  let rawPlatform: PlatformServices;

  beforeEach(() => {
    rawPlatform = createMockPlatformServices();
    vi.clearAllMocks();
  });

  describe('Logger', () => {
    it('should always allow logger and create child with plugin context', () => {
      const permissions: PermissionSpec = { platform: {} };
      const governed = createGovernedPlatformServices(rawPlatform, permissions, 'test-plugin');

      expect(rawPlatform.logger.child).toHaveBeenCalledWith({ plugin: 'test-plugin' });
      expect(governed.logger).toBeDefined();
    });
  });

  describe('LLM', () => {
    it('should proxy complete() method when permission granted', async () => {
      const permissions: PermissionSpec = {
        platform: { llm: true },
      };
      const governed = createGovernedPlatformServices(rawPlatform, permissions, 'test-plugin');

      const result = await governed.llm.complete('test prompt', { model: 'gpt-4' });

      expect(rawPlatform.llm.complete).toHaveBeenCalledWith('test prompt', { model: 'gpt-4' });
      expect(result.content).toBe('mock response');
    });

    it('should proxy stream() method when permission granted', async () => {
      const permissions: PermissionSpec = {
        platform: { llm: true },
      };
      const governed = createGovernedPlatformServices(rawPlatform, permissions, 'test-plugin');

      const chunks: string[] = [];
      for await (const chunk of governed.llm.stream('test prompt')) {
        chunks.push(chunk);
      }

      expect(rawPlatform.llm.stream).toHaveBeenCalledWith('test prompt', undefined);
      expect(chunks).toEqual(['mock', ' response']);
    });

    it('should enforce model whitelist when specified', async () => {
      const permissions: PermissionSpec = {
        platform: { llm: { models: ['gpt-4o-mini'] } },
      };
      const governed = createGovernedPlatformServices(rawPlatform, permissions, 'test-plugin');

      // Allowed model
      await governed.llm.complete('test', { model: 'gpt-4o-mini' });
      expect(rawPlatform.llm.complete).toHaveBeenCalled();

      // Disallowed model
      await expect(
        governed.llm.complete('test', { model: 'gpt-4-turbo' })
      ).rejects.toThrow(PermissionError);
    });

    it('should deny access when permission not granted', () => {
      const permissions: PermissionSpec = {
        platform: {},
      };
      const governed = createGovernedPlatformServices(rawPlatform, permissions, 'test-plugin');

      expect(() => governed.llm.complete('test')).toThrow(PermissionError);
    });
  });

  describe('Embeddings', () => {
    it('should proxy embed() method when permission granted', async () => {
      const permissions: PermissionSpec = {
        platform: { embeddings: true },
      };
      const governed = createGovernedPlatformServices(rawPlatform, permissions, 'test-plugin');

      const result = await governed.embeddings.embed('test text');

      expect(rawPlatform.embeddings.embed).toHaveBeenCalledWith('test text');
      expect(result).toEqual([0.1, 0.2, 0.3]);
    });

    it('should proxy embedBatch() method when permission granted', async () => {
      const permissions: PermissionSpec = {
        platform: { embeddings: true },
      };
      const governed = createGovernedPlatformServices(rawPlatform, permissions, 'test-plugin');

      const result = await governed.embeddings.embedBatch(['text1', 'text2']);

      expect(rawPlatform.embeddings.embedBatch).toHaveBeenCalledWith(['text1', 'text2']);
      expect(result).toHaveLength(2);
    });

    it('should proxy dimensions property when permission granted', () => {
      const permissions: PermissionSpec = {
        platform: { embeddings: true },
      };
      const governed = createGovernedPlatformServices(rawPlatform, permissions, 'test-plugin');

      expect(governed.embeddings.dimensions).toBe(1536);
    });

    it('should proxy getDimensions() method when permission granted', async () => {
      const permissions: PermissionSpec = {
        platform: { embeddings: true },
      };
      const governed = createGovernedPlatformServices(rawPlatform, permissions, 'test-plugin');

      const result = await governed.embeddings.getDimensions();

      expect(rawPlatform.embeddings.getDimensions).toHaveBeenCalled();
      expect(result).toBe(1536);
    });

    it('should deny access when permission not granted', () => {
      const permissions: PermissionSpec = {
        platform: {},
      };
      const governed = createGovernedPlatformServices(rawPlatform, permissions, 'test-plugin');

      expect(() => governed.embeddings.embed('test')).toThrow(PermissionError);
    });
  });

  describe('Cache', () => {
    it('should allow cache operations with namespace permission', async () => {
      const permissions: PermissionSpec = {
        platform: { cache: { namespaces: ['test:'] } },
      };
      const governed = createGovernedPlatformServices(rawPlatform, permissions, 'test-plugin');

      await governed.cache.set('test:key', 'value', 1000);
      await governed.cache.get('test:key');
      await governed.cache.delete('test:key');

      expect(rawPlatform.cache.set).toHaveBeenCalledWith('test:key', 'value', 1000);
      expect(rawPlatform.cache.get).toHaveBeenCalledWith('test:key');
      expect(rawPlatform.cache.delete).toHaveBeenCalledWith('test:key');
    });

    it('should enforce namespace restrictions', async () => {
      const permissions: PermissionSpec = {
        platform: { cache: { namespaces: ['test:'] } },
      };
      const governed = createGovernedPlatformServices(rawPlatform, permissions, 'test-plugin');

      // Allowed namespace
      await governed.cache.set('test:key', 'value');
      expect(rawPlatform.cache.set).toHaveBeenCalled();

      // Disallowed namespace
      await expect(governed.cache.set('other:key', 'value')).rejects.toThrow(PermissionError);
    });

    it('should proxy sorted set operations with namespace check', async () => {
      const permissions: PermissionSpec = {
        platform: { cache: { namespaces: ['queue:'] } },
      };
      const governed = createGovernedPlatformServices(rawPlatform, permissions, 'test-plugin');

      await governed.cache.zadd('queue:jobs', 12345, 'job-1');
      await governed.cache.zrangebyscore('queue:jobs', 0, 99999);
      await governed.cache.zrem('queue:jobs', 'job-1');

      expect(rawPlatform.cache.zadd).toHaveBeenCalledWith('queue:jobs', 12345, 'job-1');
      expect(rawPlatform.cache.zrangebyscore).toHaveBeenCalledWith('queue:jobs', 0, 99999);
      expect(rawPlatform.cache.zrem).toHaveBeenCalledWith('queue:jobs', 'job-1');
    });

    it('should proxy setIfNotExists with namespace check', async () => {
      const permissions: PermissionSpec = {
        platform: { cache: { namespaces: ['lock:'] } },
      };
      const governed = createGovernedPlatformServices(rawPlatform, permissions, 'test-plugin');

      const result = await governed.cache.setIfNotExists('lock:resource', 'owner-123', 5000);

      expect(rawPlatform.cache.setIfNotExists).toHaveBeenCalledWith('lock:resource', 'owner-123', 5000);
      expect(result).toBe(true);
    });

    it('should require full permission for clear()', async () => {
      const permissions: PermissionSpec = {
        platform: { cache: { namespaces: ['test:'] } },
      };
      const governed = createGovernedPlatformServices(rawPlatform, permissions, 'test-plugin');

      await expect(governed.cache.clear()).rejects.toThrow(PermissionError);

      // With full permission
      const fullPermissions: PermissionSpec = {
        platform: { cache: true },
      };
      const fullGoverned = createGovernedPlatformServices(rawPlatform, fullPermissions, 'test-plugin');

      await fullGoverned.cache.clear();
      expect(rawPlatform.cache.clear).toHaveBeenCalled();
    });

    it('should allow clear() with pattern when full permission granted', async () => {
      const permissions: PermissionSpec = {
        platform: { cache: true },
      };
      const governed = createGovernedPlatformServices(rawPlatform, permissions, 'test-plugin');

      await governed.cache.clear('test:*');
      expect(rawPlatform.cache.clear).toHaveBeenCalledWith('test:*');
    });

    it('should allow cache operations when permission is string[] (builder format)', async () => {
      const permissions: PermissionSpec = {
        platform: { cache: ['commit:'] as any },
      };
      const governed = createGovernedPlatformServices(rawPlatform, permissions, 'test-plugin');

      await governed.cache.set('commit:plan', 'value', 1000);
      await governed.cache.get('commit:plan');
      await governed.cache.delete('commit:plan');

      expect(rawPlatform.cache.set).toHaveBeenCalledWith('commit:plan', 'value', 1000);
      expect(rawPlatform.cache.get).toHaveBeenCalledWith('commit:plan');
      expect(rawPlatform.cache.delete).toHaveBeenCalledWith('commit:plan');
    });

    it('should enforce namespace restrictions when permission is string[]', async () => {
      const permissions: PermissionSpec = {
        platform: { cache: ['commit:'] as any },
      };
      const governed = createGovernedPlatformServices(rawPlatform, permissions, 'test-plugin');

      // Allowed namespace
      await governed.cache.set('commit:files-list:root', 'value');
      expect(rawPlatform.cache.set).toHaveBeenCalled();

      // Disallowed namespace
      await expect(governed.cache.set('other:key', 'value')).rejects.toThrow(PermissionError);
    });

    it('should deny access when permission not granted', () => {
      const permissions: PermissionSpec = {
        platform: {},
      };
      const governed = createGovernedPlatformServices(rawPlatform, permissions, 'test-plugin');

      expect(() => governed.cache.get('key')).toThrow(PermissionError);
    });
  });

  describe('Storage', () => {
    it('should allow storage operations within permitted paths', async () => {
      const permissions: PermissionSpec = {
        platform: { storage: { paths: ['.kb/data/'] } },
      };
      const governed = createGovernedPlatformServices(rawPlatform, permissions, 'test-plugin');

      await governed.storage.write('.kb/data/test.json', Buffer.from('test'));
      await governed.storage.read('.kb/data/test.json');
      await governed.storage.exists('.kb/data/test.json');
      await governed.storage.list('.kb/data/');
      await governed.storage.delete('.kb/data/test.json');

      expect(rawPlatform.storage.write).toHaveBeenCalled();
      expect(rawPlatform.storage.read).toHaveBeenCalled();
      expect(rawPlatform.storage.exists).toHaveBeenCalled();
      expect(rawPlatform.storage.list).toHaveBeenCalled();
      expect(rawPlatform.storage.delete).toHaveBeenCalled();
    });

    it('should enforce path restrictions', async () => {
      const permissions: PermissionSpec = {
        platform: { storage: { paths: ['.kb/data/'] } },
      };
      const governed = createGovernedPlatformServices(rawPlatform, permissions, 'test-plugin');

      // Allowed path
      await governed.storage.read('.kb/data/file.json');
      expect(rawPlatform.storage.read).toHaveBeenCalled();

      // Disallowed path
      await expect(governed.storage.read('/etc/passwd')).rejects.toThrow(PermissionError);
    });

    it('should deny access when permission not granted', () => {
      const permissions: PermissionSpec = {
        platform: {},
      };
      const governed = createGovernedPlatformServices(rawPlatform, permissions, 'test-plugin');

      expect(() => governed.storage.read('test.json')).toThrow(PermissionError);
    });
  });

  describe('VectorStore', () => {
    it('should pass through vectorStore when permission granted', async () => {
      const permissions: PermissionSpec = {
        platform: { vectorStore: true },
      };
      const governed = createGovernedPlatformServices(rawPlatform, permissions, 'test-plugin');

      await governed.vectorStore.search([0.1, 0.2], 10);
      expect(rawPlatform.vectorStore.search).toHaveBeenCalled();
    });

    it('should deny access when permission not granted', () => {
      const permissions: PermissionSpec = {
        platform: {},
      };
      const governed = createGovernedPlatformServices(rawPlatform, permissions, 'test-plugin');

      expect(() => governed.vectorStore.search([0.1], 10)).toThrow(PermissionError);
    });
  });

  describe('Analytics', () => {
    it('should always allow analytics access', async () => {
      const permissions: PermissionSpec = {
        platform: {},
      };
      const governed = createGovernedPlatformServices(rawPlatform, permissions, 'test-plugin');

      await governed.analytics.track('test.event', { data: 123 });
      expect(rawPlatform.analytics.track).toHaveBeenCalledWith('test.event', { data: 123 });
    });
  });

  describe('EventBus', () => {
    it('should always allow eventBus access', async () => {
      const permissions: PermissionSpec = {
        platform: {},
      };
      const governed = createGovernedPlatformServices(rawPlatform, permissions, 'test-plugin');

      await governed.eventBus.publish('test.event', { data: 123 });
      expect(rawPlatform.eventBus.publish).toHaveBeenCalledWith('test.event', { data: 123 });
    });
  });

  describe('Edge Cases', () => {
    it('should handle boolean true permission (full access)', async () => {
      const permissions: PermissionSpec = {
        platform: {
          cache: true,
          storage: true,
        },
      };
      const governed = createGovernedPlatformServices(rawPlatform, permissions, 'test-plugin');

      // Cache: any namespace allowed
      await governed.cache.set('any:key', 'value');
      expect(rawPlatform.cache.set).toHaveBeenCalled();

      // Storage: any path allowed
      await governed.storage.read('/any/path');
      expect(rawPlatform.storage.read).toHaveBeenCalled();
    });

    it('should handle boolean false permission (denied)', () => {
      const permissions: PermissionSpec = {
        platform: {
          cache: false,
          storage: false,
        },
      };
      const governed = createGovernedPlatformServices(rawPlatform, permissions, 'test-plugin');

      expect(() => governed.cache.get('key')).toThrow(PermissionError);
      expect(() => governed.storage.read('file')).toThrow(PermissionError);
    });

    it('should handle undefined permission (denied)', () => {
      const permissions: PermissionSpec = {
        platform: {},
      };
      const governed = createGovernedPlatformServices(rawPlatform, permissions, 'test-plugin');

      expect(() => governed.cache.get('key')).toThrow(PermissionError);
      expect(() => governed.storage.read('file')).toThrow(PermissionError);
      expect(() => governed.llm.complete('test')).toThrow(PermissionError);
    });

    it('should handle empty namespace/path arrays (deny all)', async () => {
      const permissions: PermissionSpec = {
        platform: {
          cache: { namespaces: [] },
          storage: { paths: [] },
        },
      };
      const governed = createGovernedPlatformServices(rawPlatform, permissions, 'test-plugin');

      await expect(governed.cache.get('key')).rejects.toThrow(PermissionError);
      await expect(governed.storage.read('file')).rejects.toThrow(PermissionError);
    });
  });
});
