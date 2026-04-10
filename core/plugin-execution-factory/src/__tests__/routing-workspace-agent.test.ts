import { describe, it, expect, vi } from 'vitest';
import { createIsolatedExecutionBackend } from '../isolated-backend.js';
import type { IHostResolver, HostResolution, IExecutionTransport } from '@kb-labs/core-contracts';
import type { ExecutionRequest } from '../types.js';

function makeLocalBackend() {
  return {
    platform: {} as any,
    mode: 'in-process' as const,
  };
}

function makeRequest(overrides: Partial<ExecutionRequest> = {}): ExecutionRequest {
  return {
    executionId: 'exec-1',
    handlerRef: '/path/to/handler.js',
    pluginRoot: '/path/to',
    input: {},
    descriptor: {} as any,
    ...overrides,
  };
}

describe('RoutingBackend — workspace-agent routing', () => {
  it('dispatches to workspace-agent when target.type matches and host resolves', async () => {
    const resolver: IHostResolver = {
      resolve: vi.fn().mockResolvedValue({
        hostId: 'agent-1',
        strategy: 'any-matching',
        namespaceId: 'default',
      } satisfies HostResolution),
    };

    const transportExecute = vi.fn().mockResolvedValue({ data: { result: 'from-agent' } });
    const transport: IExecutionTransport = {
      execute: transportExecute,
    };

    const backend = createIsolatedExecutionBackend({
      localBackend: makeLocalBackend(),
      strictIsolation: {
        buildTransport: () => transport,
        hostResolver: resolver,
        buildTransportForHost: () => transport,
      },
    });

    const result = await backend.execute(makeRequest({
      target: { type: 'workspace-agent', hostSelection: 'any-matching' },
    }));

    expect(result.ok).toBe(true);
    expect(resolver.resolve).toHaveBeenCalledOnce();
    expect(transportExecute).toHaveBeenCalledOnce();
  });

  it('falls back to local when host not found and fallback=local', async () => {
    const resolver: IHostResolver = {
      resolve: vi.fn().mockResolvedValue(null),
    };

    const backend = createIsolatedExecutionBackend({
      localBackend: makeLocalBackend(),
      strictIsolation: {
        buildTransport: () => ({ execute: vi.fn() }),
        hostResolver: resolver,
        buildTransportForHost: () => ({ execute: vi.fn() }),
        fallbackPolicy: 'local',
      },
    });

    // Local backend will execute — this tests the fallback path
    const result = await backend.execute(makeRequest({
      target: { type: 'workspace-agent' },
    }));

    expect(resolver.resolve).toHaveBeenCalledOnce();
    // Result comes from local backend (in-process)
    // Don't assert specific result — just that it didn't throw
    expect(result).toBeDefined();
  });

  it('returns NO_HOST_AVAILABLE error when fallback=error', async () => {
    const resolver: IHostResolver = {
      resolve: vi.fn().mockResolvedValue(null),
    };

    const backend = createIsolatedExecutionBackend({
      localBackend: makeLocalBackend(),
      strictIsolation: {
        buildTransport: () => ({ execute: vi.fn() }),
        hostResolver: resolver,
        buildTransportForHost: () => ({ execute: vi.fn() }),
        fallbackPolicy: 'error',
      },
    });

    const result = await backend.execute(makeRequest({
      target: { type: 'workspace-agent', hostSelection: 'pinned' },
    }));

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('NO_HOST_AVAILABLE');
    expect(result.error?.message).toContain('pinned');
  });

  it('skips workspace-agent routing when no hostResolver configured', async () => {
    const backend = createIsolatedExecutionBackend({
      localBackend: makeLocalBackend(),
      strictIsolation: {
        buildTransport: () => ({ execute: vi.fn() }),
        // No hostResolver — workspace-agent requests fall to local
      },
    });

    const result = await backend.execute(makeRequest({
      target: { type: 'workspace-agent' },
    }));

    // Falls through to local backend
    expect(result).toBeDefined();
  });

  it('prioritizes environmentId over workspace-agent routing', async () => {
    const resolver: IHostResolver = {
      resolve: vi.fn(),
    };

    const transportExecute = vi.fn().mockResolvedValue({ data: { from: 'container' } });

    const backend = createIsolatedExecutionBackend({
      localBackend: makeLocalBackend(),
      strictIsolation: {
        buildTransport: () => ({ execute: transportExecute }),
        hostResolver: resolver,
        buildTransportForHost: () => ({ execute: vi.fn() }),
      },
    });

    const result = await backend.execute(makeRequest({
      target: { type: 'workspace-agent', environmentId: 'env-123' },
    }));

    // environmentId takes priority — resolver never called
    expect(resolver.resolve).not.toHaveBeenCalled();
    expect(transportExecute).toHaveBeenCalledOnce();
    expect(result.ok).toBe(true);
  });
});
