/**
 * Tests for RoutingBackend logic in createExecutionBackend (mode: 'remote').
 *
 * Key behaviour:
 *   - request.target.environmentId present → RemoteBackend (via injected transport)
 *   - request.target.environmentId absent  → LocalBackend (in-process)
 */
import { describe, it, expect, vi } from 'vitest';
import { createExecutionBackend } from '../factory.js';
import type { IExecutionTransport } from '@kb-labs/core-contracts';
import type { ExecutionRequest } from '../types.js';

const platform = {
  logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {}, child: () => ({}) },
  cache: { get: async () => null, set: async () => {}, delete: async () => {}, clear: async () => {} },
  config: {},
} as unknown as Parameters<typeof createExecutionBackend>[0]['platform'];

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

function makeTransport(data: unknown = 'remote-result'): IExecutionTransport {
  return { execute: vi.fn().mockResolvedValue({ data }) };
}

describe('createExecutionBackend with mode: remote (RoutingBackend)', () => {
  it('routes to RemoteBackend when request.target.environmentId is set', async () => {
    const transport = makeTransport('remote-result');
    const backend = createExecutionBackend({ platform, mode: 'remote', remote: { transport } });

    const result = await backend.execute(makeRequest({ target: { environmentId: 'env_docker_1' } }));

    expect(transport.execute).toHaveBeenCalledOnce();
    expect(result.ok).toBe(true);
    expect(result.metadata?.['backend']).toBe('remote');
  });

  it('routes to local InProcessBackend when no environmentId', async () => {
    const transport = makeTransport();

    vi.mock('@kb-labs/plugin-runtime', () => ({
      runInProcess: vi.fn().mockResolvedValue({ data: 'local-result', executionMeta: {} }),
    }));
    vi.mock('node:fs', async (importOriginal) => {
      const actual = await importOriginal<typeof import('node:fs')>();
      return { ...actual, existsSync: vi.fn().mockReturnValue(true) };
    });

    const backend = createExecutionBackend({ platform, mode: 'remote', remote: { transport } });
    const result = await backend.execute(makeRequest()); // no target.environmentId

    expect(transport.execute).not.toHaveBeenCalled();
    expect(result.metadata?.['backend']).toBe('in-process');
  });

  it('routes to local when target has no environmentId', async () => {
    const transport = makeTransport();

    vi.mock('@kb-labs/plugin-runtime', () => ({
      runInProcess: vi.fn().mockResolvedValue({ data: null, executionMeta: {} }),
    }));
    vi.mock('node:fs', async (importOriginal) => {
      const actual = await importOriginal<typeof import('node:fs')>();
      return { ...actual, existsSync: vi.fn().mockReturnValue(true) };
    });

    const backend = createExecutionBackend({ platform, mode: 'remote', remote: { transport } });
    await backend.execute(makeRequest({ target: { workspaceId: 'ws_123' } })); // no environmentId

    expect(transport.execute).not.toHaveBeenCalled();
  });

  it('throws when mode is remote but transport is missing', () => {
    expect(() => createExecutionBackend({ platform, mode: 'remote' })).toThrow(
      'Remote mode requires options.remote.transport',
    );
  });

  it('shutdown resolves without throwing', async () => {
    const backend = createExecutionBackend({ platform, mode: 'remote', remote: { transport: makeTransport() } });
    await expect(backend.shutdown()).resolves.toBeUndefined();
  });
});
