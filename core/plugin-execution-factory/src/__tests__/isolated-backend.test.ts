/**
 * Tests for createIsolatedExecutionBackend.
 *
 * Key behaviour:
 *   - Without strictIsolation → returns plain local backend
 *   - With strictIsolation + environmentId → routes to RemoteBackend (fresh per-job via factory)
 *   - With strictIsolation + no environmentId → routes to local backend
 *   - Remote factory called once per-job (not shared)
 */
import { describe, it, expect, vi } from 'vitest';
import { createIsolatedExecutionBackend } from '../isolated-backend.js';
import type { RemoteJobContext } from '../isolated-backend.js';
import type { IExecutionTransport } from '@kb-labs/core-contracts';
import type { ExecutionRequest } from '../types.js';

const platform = {
  logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {}, child: () => ({}) },
  cache: { get: async () => null, set: async () => {}, delete: async () => {}, clear: async () => {} },
  config: {},
} as unknown as Parameters<typeof createIsolatedExecutionBackend>[0]['localBackend']['platform'];

function makeRequest(overrides: Partial<ExecutionRequest> = {}): ExecutionRequest {
  return {
    executionId: 'exec-001',
    handlerRef: './dist/handler.js',
    pluginRoot: '/tmp/plugin',
    input: {},
    descriptor: { hostType: 'workflow' } as unknown as ExecutionRequest['descriptor'],
    ...overrides,
  };
}

function makeTransport(label = 'remote'): IExecutionTransport {
  return { execute: vi.fn().mockResolvedValue({ data: label }) };
}

describe('createIsolatedExecutionBackend', () => {
  describe('without strictIsolation', () => {
    it('returns a backend that has health/stats/shutdown', () => {
      const backend = createIsolatedExecutionBackend({ localBackend: { platform } });
      expect(typeof backend.execute).toBe('function');
      expect(typeof backend.health).toBe('function');
      expect(typeof backend.stats).toBe('function');
      expect(typeof backend.shutdown).toBe('function');
    });

    it('shutdown resolves without throwing', async () => {
      const backend = createIsolatedExecutionBackend({ localBackend: { platform } });
      await expect(backend.shutdown()).resolves.toBeUndefined();
    });
  });

  describe('with strictIsolation', () => {
    it('routes to remote when request.target.environmentId is present', async () => {
      const transport = makeTransport('remote-result');
      const buildTransport = vi.fn().mockReturnValue(transport);

      const backend = createIsolatedExecutionBackend({
        localBackend: { platform },
        strictIsolation: { buildTransport },
      });

      const result = await backend.execute(makeRequest({ target: { environmentId: 'env-abc', namespace: 'ns-1' } }));

      expect(buildTransport).toHaveBeenCalledWith<[RemoteJobContext]>({
        runtimeHostId: 'env-abc',
        namespaceId: 'ns-1',
      });
      expect(transport.execute).toHaveBeenCalledOnce();
      expect(result.ok).toBe(true);
      expect(result.metadata?.['backend']).toBe('remote');
    });

    it('routes to local when no environmentId', async () => {
      vi.mock('@kb-labs/plugin-runtime', () => ({
        runInProcess: vi.fn().mockResolvedValue({ data: 'local-result', executionMeta: {} }),
      }));
      vi.mock('node:fs', async (importOriginal) => {
        const actual = await importOriginal<typeof import('node:fs')>();
        return { ...actual, existsSync: vi.fn().mockReturnValue(true) };
      });

      const transport = makeTransport();
      const buildTransport = vi.fn().mockReturnValue(transport);

      const backend = createIsolatedExecutionBackend({
        localBackend: { platform },
        strictIsolation: { buildTransport },
      });

      await backend.execute(makeRequest()); // no target at all

      expect(buildTransport).not.toHaveBeenCalled();
      expect(transport.execute).not.toHaveBeenCalled();
    });

    it('routes to local when target has no environmentId', async () => {
      vi.mock('@kb-labs/plugin-runtime', () => ({
        runInProcess: vi.fn().mockResolvedValue({ data: null, executionMeta: {} }),
      }));

      const transport = makeTransport();
      const buildTransport = vi.fn().mockReturnValue(transport);

      const backend = createIsolatedExecutionBackend({
        localBackend: { platform },
        strictIsolation: { buildTransport },
      });

      await backend.execute(makeRequest({ target: { workspaceId: 'ws-123' } })); // no environmentId

      expect(buildTransport).not.toHaveBeenCalled();
      expect(transport.execute).not.toHaveBeenCalled();
    });

    it('creates a fresh remote backend per-job (factory called each time)', async () => {
      const t1 = makeTransport('job-1');
      const t2 = makeTransport('job-2');
      let callCount = 0;
      const buildTransport = vi.fn().mockImplementation(() => {
        callCount++;
        return callCount === 1 ? t1 : t2;
      });

      const backend = createIsolatedExecutionBackend({
        localBackend: { platform },
        strictIsolation: { buildTransport },
      });

      await backend.execute(makeRequest({ target: { environmentId: 'env-1', namespace: 'ns-a' } }));
      await backend.execute(makeRequest({ target: { environmentId: 'env-2', namespace: 'ns-b' } }));

      expect(buildTransport).toHaveBeenCalledTimes(2);
      expect(buildTransport).toHaveBeenNthCalledWith<[RemoteJobContext]>(1, { runtimeHostId: 'env-1', namespaceId: 'ns-a' });
      expect(buildTransport).toHaveBeenNthCalledWith<[RemoteJobContext]>(2, { runtimeHostId: 'env-2', namespaceId: 'ns-b' });
      expect(t1.execute).toHaveBeenCalledOnce();
      expect(t2.execute).toHaveBeenCalledOnce();
    });

    it('passes workspaceRootOnHost to RemoteBackend', async () => {
      const transport = makeTransport();
      const buildTransport = vi.fn().mockReturnValue(transport);

      // workspaceRootOnHost is used internally in RemoteBackend for path remapping.
      // We verify it doesn't throw and transport is called correctly.
      const backend = createIsolatedExecutionBackend({
        localBackend: { platform },
        strictIsolation: { buildTransport, workspaceRootOnHost: '/host/monorepo' },
      });

      const result = await backend.execute(makeRequest({ target: { environmentId: 'env-xyz' } }));
      expect(result.ok).toBe(true);
      expect(buildTransport).toHaveBeenCalledWith<[RemoteJobContext]>({ runtimeHostId: 'env-xyz', namespaceId: 'default' });
    });

    it('health/stats delegate to local backend', () => {
      const backend = createIsolatedExecutionBackend({
        localBackend: { platform },
        strictIsolation: { buildTransport: vi.fn().mockReturnValue(makeTransport()) },
      });

      expect(() => backend.health()).not.toThrow();
      expect(() => backend.stats()).not.toThrow();
    });

    it('shutdown delegates to local backend', async () => {
      const backend = createIsolatedExecutionBackend({
        localBackend: { platform },
        strictIsolation: { buildTransport: vi.fn().mockReturnValue(makeTransport()) },
      });

      await expect(backend.shutdown()).resolves.toBeUndefined();
    });
  });
});
