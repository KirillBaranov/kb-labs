import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';
import Fastify from 'fastify';
import type { IEntityRegistry, RegistrySnapshot } from '@kb-labs/core-registry';
import type { RestApiConfig } from '@kb-labs/rest-api-core';
import { registerCacheRoutes } from '../cache';

const BASE_CONFIG: RestApiConfig = {
  port: 3000,
  basePath: '/api/v1',
  apiVersion: 'test',
  cors: {
    origins: [],
    allowCredentials: true,
    profile: 'dev',
  },
  plugins: [],
  mockMode: false,
};

function createMockSnapshot(rev: number): RegistrySnapshot {
  return {
    schema: 'kb.registry/1',
    rev,
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    ttlMs: 60_000,
    partial: false,
    stale: false,
    source: { platformVersion: 'test', cwd: process.cwd() },
    corrupted: false,
    plugins: [],
    manifests: [],
    ts: Date.now(),
  };
}

describe('registerCacheRoutes', () => {
  let app: ReturnType<typeof Fastify>;
  let mockCliApi: IEntityRegistry;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = Fastify({ logger: false });

    mockCliApi = {
      snapshot: vi.fn(),
      refresh: vi.fn(),
      listPlugins: vi.fn(),
    } as unknown as IEntityRegistry;

    await registerCacheRoutes(app, BASE_CONFIG, mockCliApi);
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /api/v1/cache/invalidate', () => {
    it('successfully invalidates cache and refreshes registry', async () => {
      const beforeSnapshot = createMockSnapshot(1);
      const afterSnapshot = createMockSnapshot(2);
      const plugins = [
        { id: '@kb-labs/plugin-1', version: '1.0.0', source: { kind: 'local' as const, path: '/plugins/plugin-1' } },
        { id: '@kb-labs/plugin-2', version: '1.0.0', source: { kind: 'local' as const, path: '/plugins/plugin-2' } },
      ];

      vi.mocked(mockCliApi.snapshot)
        .mockReturnValueOnce(beforeSnapshot)
        .mockReturnValueOnce(afterSnapshot);
      vi.mocked(mockCliApi.refresh).mockResolvedValue(undefined);
      vi.mocked(mockCliApi.listPlugins).mockResolvedValue(plugins);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/cache/invalidate',
      });

      expect(response.statusCode).toBe(200);
      const payload = response.json();

      expect(payload.ok).toBe(true);
      expect(payload.data.invalidated).toBe(true);
      expect(payload.data.previousRev).toBe(1);
      expect(payload.data.newRev).toBe(2);
      expect(payload.data.pluginsDiscovered).toBe(2);
      expect(payload.data.timestamp).toBeDefined();
      expect(payload.meta.requestId).toBeDefined();
      expect(payload.meta.durationMs).toBeGreaterThanOrEqual(0);
      expect(payload.meta.apiVersion).toBe('1.0.0');

      expect(mockCliApi.snapshot).toHaveBeenCalledTimes(2);
      expect(mockCliApi.refresh).toHaveBeenCalledTimes(1);
      expect(mockCliApi.listPlugins).toHaveBeenCalledTimes(1);
    });

    it('returns previous and new revision numbers', async () => {
      const beforeSnapshot = createMockSnapshot(42);
      const afterSnapshot = createMockSnapshot(43);

      vi.mocked(mockCliApi.snapshot)
        .mockReturnValueOnce(beforeSnapshot)
        .mockReturnValueOnce(afterSnapshot);
      vi.mocked(mockCliApi.refresh).mockResolvedValue(undefined);
      vi.mocked(mockCliApi.listPlugins).mockResolvedValue([]);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/cache/invalidate',
      });

      expect(response.statusCode).toBe(200);
      const payload = response.json();
      expect(payload.data.previousRev).toBe(42);
      expect(payload.data.newRev).toBe(43);
    });

    it('includes plugin registry count', async () => {
      const snapshot = createMockSnapshot(1);
      const plugins = Array.from({ length: 15 }, (_, i) => ({
        id: `@kb-labs/plugin-${i}`,
        version: '1.0.0',
        source: { kind: 'local' as const, path: `/plugins/plugin-${i}` },
      }));

      vi.mocked(mockCliApi.snapshot).mockReturnValue(snapshot);
      vi.mocked(mockCliApi.refresh).mockResolvedValue(undefined);
      vi.mocked(mockCliApi.listPlugins).mockResolvedValue(plugins);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/cache/invalidate',
      });

      expect(response.statusCode).toBe(200);
      const payload = response.json();
      expect(payload.data.pluginsDiscovered).toBe(15);
    });

    it('handles cache refresh errors gracefully', async () => {
      const beforeSnapshot = createMockSnapshot(1);
      const error = new Error('Registry refresh failed');

      vi.mocked(mockCliApi.snapshot).mockReturnValue(beforeSnapshot);
      vi.mocked(mockCliApi.refresh).mockRejectedValue(error);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/cache/invalidate',
      });

      expect(response.statusCode).toBe(500);
      const payload = response.json();

      expect(payload.ok).toBe(false);
      expect(payload.error.code).toBe('CACHE_INVALIDATION_FAILED');
      expect(payload.error.message).toBe('Registry refresh failed');
      expect(payload.meta.requestId).toBeDefined();
      expect(payload.meta.durationMs).toBeGreaterThanOrEqual(0);

      expect(mockCliApi.refresh).toHaveBeenCalledTimes(1);
      expect(mockCliApi.listPlugins).not.toHaveBeenCalled();
    });

    it('handles non-Error exceptions', async () => {
      const beforeSnapshot = createMockSnapshot(1);

      vi.mocked(mockCliApi.snapshot).mockReturnValue(beforeSnapshot);
      vi.mocked(mockCliApi.refresh).mockRejectedValue('String error');

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/cache/invalidate',
      });

      expect(response.statusCode).toBe(500);
      const payload = response.json();

      expect(payload.ok).toBe(false);
      expect(payload.error.code).toBe('CACHE_INVALIDATION_FAILED');
      expect(payload.error.message).toBe('Cache invalidation failed');
    });

    it('handles snapshot() errors', async () => {
      vi.mocked(mockCliApi.snapshot).mockImplementation(() => {
        throw new Error('Registry snapshot unavailable');
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/cache/invalidate',
      });

      expect(response.statusCode).toBe(500);
      const payload = response.json();
      expect(payload.ok).toBe(false);
      expect(payload.error.message).toBe('Registry snapshot unavailable');
    });

    it('tracks request timing in metadata', async () => {
      const snapshot = createMockSnapshot(1);

      vi.mocked(mockCliApi.snapshot).mockReturnValue(snapshot);
      vi.mocked(mockCliApi.refresh).mockImplementation(async () => {
        await new Promise((resolve) => {
          setTimeout(resolve, 10);
        });
      });
      vi.mocked(mockCliApi.listPlugins).mockResolvedValue([]);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/cache/invalidate',
      });

      expect(response.statusCode).toBe(200);
      const payload = response.json();
      expect(payload.meta.durationMs).toBeGreaterThanOrEqual(10);
    });

    it('includes timestamp in ISO format', async () => {
      const snapshot = createMockSnapshot(1);

      vi.mocked(mockCliApi.snapshot).mockReturnValue(snapshot);
      vi.mocked(mockCliApi.refresh).mockResolvedValue(undefined);
      vi.mocked(mockCliApi.listPlugins).mockResolvedValue([]);

      const before = new Date();
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/cache/invalidate',
      });
      const after = new Date();

      expect(response.statusCode).toBe(200);
      const payload = response.json();
      const timestamp = new Date(payload.data.timestamp);

      expect(timestamp).toBeInstanceOf(Date);
      expect(timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('handles empty plugin list after refresh', async () => {
      const beforeSnapshot = createMockSnapshot(1);
      const afterSnapshot = createMockSnapshot(2);

      vi.mocked(mockCliApi.snapshot)
        .mockReturnValueOnce(beforeSnapshot)
        .mockReturnValueOnce(afterSnapshot);
      vi.mocked(mockCliApi.refresh).mockResolvedValue(undefined);
      vi.mocked(mockCliApi.listPlugins).mockResolvedValue([]);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/cache/invalidate',
      });

      expect(response.statusCode).toBe(200);
      const payload = response.json();
      expect(payload.data.pluginsDiscovered).toBe(0);
    });
  });
});
