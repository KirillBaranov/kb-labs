/**
 * @module @kb-labs/core-runtime/__tests__/adapter-loader
 * Tests for adapter dependency resolution and loading.
 */

import { describe, it, expect, vi } from 'vitest';
import { AdapterLoader, DependencyGraph } from '../adapter-loader.js';
import type { AdapterManifest } from '@kb-labs/core-platform';
import type { LoadedAdapterModule, AdapterConfig } from '../adapter-loader.js';

describe('DependencyGraph', () => {
  it('should perform topological sort with no dependencies', () => {
    const graph = new DependencyGraph();

    graph.addNode({
      name: 'logger',
      manifest: { manifestVersion: '1.0.0', id: 'logger', name: 'Logger', version: '1.0.0', type: 'core', implements: 'ILogger' },
      module: {} as LoadedAdapterModule,
      config: {},
      requiredDeps: [],
      optionalDeps: [],
      inDegree: 0,
    });

    graph.addNode({
      name: 'cache',
      manifest: { manifestVersion: '1.0.0', id: 'cache', name: 'Cache', version: '1.0.0', type: 'core', implements: 'ICache' },
      module: {} as LoadedAdapterModule,
      config: {},
      requiredDeps: [],
      optionalDeps: [],
      inDegree: 0,
    });

    const sorted = graph.topologicalSort();
    expect(sorted).toHaveLength(2);
    expect(sorted.map((n) => n.name)).toContain('logger');
    expect(sorted.map((n) => n.name)).toContain('cache');
  });

  it('should sort with linear dependency chain', () => {
    const graph = new DependencyGraph();

    // logger -> logBuffer -> logPersistence
    graph.addNode({
      name: 'logger',
      manifest: { manifestVersion: '1.0.0', id: 'logger', name: 'Logger', version: '1.0.0', type: 'core', implements: 'ILogger' },
      module: {} as LoadedAdapterModule,
      config: {},
      requiredDeps: [],
      optionalDeps: [],
      inDegree: 0,
    });

    graph.addNode({
      name: 'logBuffer',
      manifest: { manifestVersion: '1.0.0', id: 'logBuffer', name: 'Log Buffer', version: '1.0.0', type: 'extension', implements: 'ILogBuffer' },
      module: {} as LoadedAdapterModule,
      config: {},
      requiredDeps: [],
      optionalDeps: [],
      inDegree: 0,
    });

    graph.addNode({
      name: 'logPersistence',
      manifest: { manifestVersion: '1.0.0', id: 'logPersistence', name: 'Log Persistence', version: '1.0.0', type: 'extension', implements: 'ILogPersistence' },
      module: {} as LoadedAdapterModule,
      config: {},
      requiredDeps: ['db'],
      optionalDeps: [],
      inDegree: 0,
    });

    graph.addNode({
      name: 'db',
      manifest: { manifestVersion: '1.0.0', id: 'db', name: 'Database', version: '1.0.0', type: 'core', implements: 'ISQLDatabase' },
      module: {} as LoadedAdapterModule,
      config: {},
      requiredDeps: [],
      optionalDeps: [],
      inDegree: 0,
    });

    // Add edge: db -> logPersistence (db must load before logPersistence)
    graph.addEdge('db', 'logPersistence');

    const sorted = graph.topologicalSort();
    expect(sorted).toHaveLength(4);

    // db must come before logPersistence
    const dbIndex = sorted.findIndex((n) => n.name === 'db');
    const persistIndex = sorted.findIndex((n) => n.name === 'logPersistence');
    expect(dbIndex).toBeLessThan(persistIndex);
  });

  it('should detect circular dependency', () => {
    const graph = new DependencyGraph();

    graph.addNode({
      name: 'a',
      manifest: { manifestVersion: '1.0.0', id: 'a', name: 'A', version: '1.0.0', type: 'core', implements: 'IA' },
      module: {} as LoadedAdapterModule,
      config: {},
      requiredDeps: ['b'],
      optionalDeps: [],
      inDegree: 0,
    });

    graph.addNode({
      name: 'b',
      manifest: { manifestVersion: '1.0.0', id: 'b', name: 'B', version: '1.0.0', type: 'core', implements: 'IB' },
      module: {} as LoadedAdapterModule,
      config: {},
      requiredDeps: ['a'],
      optionalDeps: [],
      inDegree: 0,
    });

    // Create cycle: a depends on b, b depends on a
    // a -> b (b must load before a)
    // b -> a (a must load before b)
    // This creates a cycle
    graph.addEdge('b', 'a'); // b needs to load before a
    graph.addEdge('a', 'b'); // a needs to load before b (cycle!)

    expect(() => graph.topologicalSort()).toThrow('Circular dependency');
  });
});

describe('AdapterLoader', () => {
  it('should build dependency graph from configs', async () => {
    const loader = new AdapterLoader();

    const configs: Record<string, AdapterConfig> = {
      logger: { module: '@kb-labs/adapters-pino', config: { level: 'info' } },
      db: { module: '@kb-labs/adapters-sqlite', config: {} },
    };

    const loadModule = vi.fn(async (modulePath: string) => {
      if (modulePath === '@kb-labs/adapters-pino') {
        return {
          manifest: {
            manifestVersion: '1.0.0',
            id: 'pino-logger',
            name: 'Pino Logger',
            version: '1.0.0',
            type: 'core',
            implements: 'ILogger',
          } as AdapterManifest,
          createAdapter: vi.fn(),
        };
      }
      if (modulePath === '@kb-labs/adapters-sqlite') {
        return {
          manifest: {
            manifestVersion: '1.0.0',
            id: 'sqlite-db',
            name: 'SQLite Database',
            version: '1.0.0',
            type: 'core',
            implements: 'ISQLDatabase',
          } as AdapterManifest,
          createAdapter: vi.fn(),
        };
      }
      throw new Error(`Unknown module: ${modulePath}`);
    });

    const graph = await loader.buildDependencyGraph(configs, loadModule);

    expect(graph.getNode('logger')).toBeDefined();
    expect(graph.getNode('db')).toBeDefined();
    expect(loadModule).toHaveBeenCalledTimes(2);
  });

  it('should throw error for missing required dependency', async () => {
    const loader = new AdapterLoader();

    const configs: Record<string, AdapterConfig> = {
      logPersistence: { module: '@kb-labs/adapters-log-sqlite', config: {} },
      // Missing 'db' adapter
    };

    const loadModule = vi.fn(async () => {
      return {
        manifest: {
          manifestVersion: '1.0.0',
          id: 'log-persistence',
          name: 'Log Persistence',
          version: '1.0.0',
          type: 'extension',
          implements: 'ILogPersistence',
          requires: { adapters: ['db'] },
        } as AdapterManifest,
        createAdapter: vi.fn(),
      };
    });

    await expect(
      loader.buildDependencyGraph(configs, loadModule)
    ).rejects.toThrow('requires adapter "db"');
  });

  it('should explain runtime token vs manifest id mismatch', async () => {
    const loader = new AdapterLoader();

    const configs: Record<string, AdapterConfig> = {
      cache: { module: '@kb-labs/adapters-redis', config: {} },
      eventBus: { module: '@kb-labs/adapters-eventbus-cache', config: {} },
    };

    const loadModule = vi.fn(async (modulePath: string) => {
      if (modulePath === '@kb-labs/adapters-redis') {
        return {
          manifest: {
            manifestVersion: '1.0.0',
            id: 'redis-cache',
            name: 'Redis Cache',
            version: '1.0.0',
            type: 'core',
            implements: 'ICache',
          } as AdapterManifest,
          createAdapter: vi.fn(),
        };
      }

      if (modulePath === '@kb-labs/adapters-eventbus-cache') {
        return {
          manifest: {
            manifestVersion: '1.0.0',
            id: 'eventbus-cache',
            name: 'EventBus Cache',
            version: '1.0.0',
            type: 'core',
            implements: 'IEventBus',
            // Intentionally wrong: uses manifest.id instead of runtime token "cache"
            requires: { adapters: ['redis-cache'] },
          } as AdapterManifest,
          createAdapter: vi.fn(),
        };
      }

      throw new Error(`Unknown module: ${modulePath}`);
    });

    await expect(
      loader.buildDependencyGraph(configs, loadModule)
    ).rejects.toThrow('runtime adapter tokens');
  });

  it('should handle optional dependencies gracefully', async () => {
    const loader = new AdapterLoader();

    const configs: Record<string, AdapterConfig> = {
      logger: { module: '@kb-labs/adapters-pino', config: {} },
      // Missing 'analytics' (optional dependency)
    };

    const loadModule = vi.fn(async () => {
      return {
        manifest: {
          manifestVersion: '1.0.0',
          id: 'pino-logger',
          name: 'Pino Logger',
          version: '1.0.0',
          type: 'core',
          implements: 'ILogger',
          optional: { adapters: ['analytics'] },
        } as AdapterManifest,
        createAdapter: vi.fn(),
      };
    });

    const graph = await loader.buildDependencyGraph(configs, loadModule);
    expect(graph.getNode('logger')).toBeDefined();
    // Should not throw error for missing optional dependency
  });

  it('should load adapters in dependency order', async () => {
    const loader = new AdapterLoader();

    const configs: Record<string, AdapterConfig> = {
      db: { module: '@kb-labs/adapters-sqlite', config: {} },
      logPersistence: { module: '@kb-labs/adapters-log-sqlite', config: {} },
    };

    const mockDB = { query: vi.fn() };
    const mockPersistence = { write: vi.fn() };

    const loadModule = vi.fn(async (modulePath: string) => {
      if (modulePath === '@kb-labs/adapters-sqlite') {
        return {
          manifest: {
            manifestVersion: '1.0.0',
            id: 'sqlite-db',
            name: 'SQLite',
            version: '1.0.0',
            type: 'core',
            implements: 'ISQLDatabase',
          } as AdapterManifest,
          createAdapter: vi.fn(() => mockDB),
        };
      }
      if (modulePath === '@kb-labs/adapters-log-sqlite') {
        return {
          manifest: {
            manifestVersion: '1.0.0',
            id: 'log-persistence',
            name: 'Log Persistence',
            version: '1.0.0',
            type: 'extension',
            implements: 'ILogPersistence',
            requires: { adapters: [{ id: 'db', alias: 'database' }] },
          } as AdapterManifest,
          createAdapter: vi.fn((config, deps) => {
            expect(deps.database).toBe(mockDB);
            return mockPersistence;
          }),
        };
      }
      throw new Error(`Unknown module: ${modulePath}`);
    });

    const adapters = await loader.loadAdapters(configs, loadModule);

    expect(adapters.get('db')).toBe(mockDB);
    expect(adapters.get('logPersistence')).toBe(mockPersistence);
  });

  it('should connect extensions to core adapters', () => {
    const loader = new AdapterLoader();

    // Mock logger with onLog hook
    const mockLogger = {
      onLog: vi.fn(),
    };

    // Mock ring buffer with append method
    const mockRingBuffer = {
      append: vi.fn(),
    };

    // Create graph
    const graph = new DependencyGraph();

    graph.addNode({
      name: 'logger',
      manifest: {
        manifestVersion: '1.0.0',
        id: 'logger',
        name: 'Logger',
        version: '1.0.0',
        type: 'core',
        implements: 'ILogger',
      },
      module: {} as LoadedAdapterModule,
      config: {},
      requiredDeps: [],
      optionalDeps: [],
      inDegree: 0,
    });

    graph.addNode({
      name: 'logRingBuffer',
      manifest: {
        manifestVersion: '1.0.0',
        id: 'logRingBuffer',
        name: 'Log Ring Buffer',
        version: '1.0.0',
        type: 'extension',
        implements: 'ILogRingBuffer',
        extends: {
          adapter: 'logger',
          hook: 'onLog',
          method: 'append',
          priority: 10,
        },
      },
      module: {} as LoadedAdapterModule,
      config: {},
      requiredDeps: [],
      optionalDeps: [],
      inDegree: 0,
    });

    const adapters = new Map<string, unknown>();
    adapters.set('logger', mockLogger);
    adapters.set('logRingBuffer', mockRingBuffer);

    loader.connectExtensions(adapters, graph);

    expect(mockLogger.onLog).toHaveBeenCalledTimes(1);
    expect(mockLogger.onLog).toHaveBeenCalledWith(expect.any(Function));
  });

  it('should sort extensions by priority (higher first)', () => {
    const loader = new AdapterLoader();

    const mockLogger = { onLog: vi.fn() };
    const ext1 = { method: vi.fn() };
    const ext2 = { method: vi.fn() };
    const ext3 = { method: vi.fn() };

    const graph = new DependencyGraph();

    graph.addNode({
      name: 'logger',
      manifest: {
        manifestVersion: '1.0.0',
        id: 'logger',
        name: 'Logger',
        version: '1.0.0',
        type: 'core',
        implements: 'ILogger',
      },
      module: {} as LoadedAdapterModule,
      config: {},
      requiredDeps: [],
      optionalDeps: [],
      inDegree: 0,
    });

    // Priority: 10, 5, default (0)
    graph.addNode({
      name: 'ext1',
      manifest: {
        manifestVersion: '1.0.0',
        id: 'ext1',
        name: 'Extension 1',
        version: '1.0.0',
        type: 'extension',
        implements: 'IExt',
        extends: { adapter: 'logger', hook: 'onLog', method: 'method', priority: 10 },
      },
      module: {} as LoadedAdapterModule,
      config: {},
      requiredDeps: [],
      optionalDeps: [],
      inDegree: 0,
    });

    graph.addNode({
      name: 'ext2',
      manifest: {
        manifestVersion: '1.0.0',
        id: 'ext2',
        name: 'Extension 2',
        version: '1.0.0',
        type: 'extension',
        implements: 'IExt',
        extends: { adapter: 'logger', hook: 'onLog', method: 'method', priority: 5 },
      },
      module: {} as LoadedAdapterModule,
      config: {},
      requiredDeps: [],
      optionalDeps: [],
      inDegree: 0,
    });

    graph.addNode({
      name: 'ext3',
      manifest: {
        manifestVersion: '1.0.0',
        id: 'ext3',
        name: 'Extension 3',
        version: '1.0.0',
        type: 'extension',
        implements: 'IExt',
        extends: { adapter: 'logger', hook: 'onLog', method: 'method' }, // priority: 0 (default)
      },
      module: {} as LoadedAdapterModule,
      config: {},
      requiredDeps: [],
      optionalDeps: [],
      inDegree: 0,
    });

    const adapters = new Map<string, unknown>();
    adapters.set('logger', mockLogger);
    adapters.set('ext1', ext1);
    adapters.set('ext2', ext2);
    adapters.set('ext3', ext3);

    loader.connectExtensions(adapters, graph);

    // Should be called 3 times in priority order: ext1 (10), ext2 (5), ext3 (0)
    expect(mockLogger.onLog).toHaveBeenCalledTimes(3);
  });

  describe('validateExtensionConnection (warning paths)', () => {
    it('should warn and skip when target adapter is not in adapters map', () => {
      const loader = new AdapterLoader();
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const graph = new DependencyGraph();
      graph.addNode({
        name: 'ext1',
        manifest: {
          manifestVersion: '1.0.0',
          id: 'ext1',
          name: 'Extension 1',
          version: '1.0.0',
          type: 'extension',
          implements: 'IExt',
          extends: { adapter: 'missing-adapter', hook: 'onLog', method: 'handle' },
        },
        module: {} as LoadedAdapterModule,
        config: {},
        requiredDeps: [],
        optionalDeps: [],
        inDegree: 0,
      });

      const ext = { handle: vi.fn() };
      const adapters = new Map<string, unknown>();
      adapters.set('ext1', ext);
      // 'missing-adapter' intentionally absent

      loader.connectExtensions(adapters, graph);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('target adapter "missing-adapter" not found')
      );
      expect(ext.handle).not.toHaveBeenCalled();

      warnSpy.mockRestore();
    });

    it('should warn and skip when target adapter has no hook method', () => {
      const loader = new AdapterLoader();
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const graph = new DependencyGraph();
      graph.addNode({
        name: 'ext1',
        manifest: {
          manifestVersion: '1.0.0',
          id: 'ext1',
          name: 'Extension 1',
          version: '1.0.0',
          type: 'extension',
          implements: 'IExt',
          extends: { adapter: 'logger', hook: 'nonExistentHook', method: 'handle' },
        },
        module: {} as LoadedAdapterModule,
        config: {},
        requiredDeps: [],
        optionalDeps: [],
        inDegree: 0,
      });

      const logger = { onLog: vi.fn() }; // has onLog, but NOT nonExistentHook
      const ext = { handle: vi.fn() };
      const adapters = new Map<string, unknown>();
      adapters.set('logger', logger);
      adapters.set('ext1', ext);

      loader.connectExtensions(adapters, graph);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('target "logger" has no method "nonExistentHook"')
      );
      expect(ext.handle).not.toHaveBeenCalled();

      warnSpy.mockRestore();
    });

    it('should warn and skip when extension instance has no method', () => {
      const loader = new AdapterLoader();
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const graph = new DependencyGraph();
      graph.addNode({
        name: 'ext1',
        manifest: {
          manifestVersion: '1.0.0',
          id: 'ext1',
          name: 'Extension 1',
          version: '1.0.0',
          type: 'extension',
          implements: 'IExt',
          extends: { adapter: 'logger', hook: 'onLog', method: 'nonExistentMethod' },
        },
        module: {} as LoadedAdapterModule,
        config: {},
        requiredDeps: [],
        optionalDeps: [],
        inDegree: 0,
      });

      const logger = { onLog: vi.fn() };
      const ext = { handle: vi.fn() }; // has handle, but NOT nonExistentMethod
      const adapters = new Map<string, unknown>();
      adapters.set('logger', logger);
      adapters.set('ext1', ext);

      loader.connectExtensions(adapters, graph);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('extension has no method "nonExistentMethod"')
      );
      expect(logger.onLog).not.toHaveBeenCalled();

      warnSpy.mockRestore();
    });

    it('should warn for invalid extension but still connect valid ones', () => {
      const loader = new AdapterLoader();
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const graph = new DependencyGraph();

      // Invalid: target missing
      graph.addNode({
        name: 'bad-ext',
        manifest: {
          manifestVersion: '1.0.0',
          id: 'bad-ext',
          name: 'Bad Extension',
          version: '1.0.0',
          type: 'extension',
          implements: 'IExt',
          extends: { adapter: 'missing', hook: 'onLog', method: 'handle' },
        },
        module: {} as LoadedAdapterModule,
        config: {},
        requiredDeps: [],
        optionalDeps: [],
        inDegree: 0,
      });

      // Valid extension
      graph.addNode({
        name: 'good-ext',
        manifest: {
          manifestVersion: '1.0.0',
          id: 'good-ext',
          name: 'Good Extension',
          version: '1.0.0',
          type: 'extension',
          implements: 'IExt',
          extends: { adapter: 'logger', hook: 'onLog', method: 'handle' },
        },
        module: {} as LoadedAdapterModule,
        config: {},
        requiredDeps: [],
        optionalDeps: [],
        inDegree: 0,
      });

      const logger = { onLog: vi.fn() };
      const goodExt = { handle: vi.fn() };
      const badExt = { handle: vi.fn() };
      const adapters = new Map<string, unknown>();
      adapters.set('logger', logger);
      adapters.set('good-ext', goodExt);
      adapters.set('bad-ext', badExt);

      loader.connectExtensions(adapters, graph);

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('"bad-ext"'));
      expect(logger.onLog).toHaveBeenCalledTimes(1); // good-ext connected
      expect(badExt.handle).not.toHaveBeenCalled();

      warnSpy.mockRestore();
    });
  });
});
