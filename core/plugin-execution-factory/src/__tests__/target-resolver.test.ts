/**
 * @module @kb-labs/plugin-execution-factory/__tests__/target-resolver
 *
 * Unit tests for resolveExecutionTarget().
 */

import { describe, it, expect } from 'vitest';
import { resolveExecutionTarget } from '../target-resolver.js';
import type { ExecutionRequest } from '../types.js';
import type { PlatformServices } from '@kb-labs/plugin-contracts';

const mockPlatform = {} as PlatformServices;

function makeRequest(overrides: Partial<ExecutionRequest> = {}): ExecutionRequest {
  return {
    executionId: 'exec-1',
    pluginRoot: '/dist',
    handlerRef: 'handler.js',
    descriptor: {
      hostType: 'cli',
      pluginId: '@kb-labs/test',
      pluginVersion: '1.0.0',
      requestId: 'req-1',
      permissions: {},
      hostContext: { host: 'cli', argv: [], flags: {} },
    },
    input: {},
    ...overrides,
  };
}

describe('resolveExecutionTarget()', () => {
  it('returns request unchanged when no target', async () => {
    const req = makeRequest();
    const result = await resolveExecutionTarget(req, mockPlatform);
    expect(result).toBe(req);
  });

  it('throws when target has no namespace', async () => {
    const req = makeRequest({ target: { namespace: '' } });
    await expect(resolveExecutionTarget(req, mockPlatform)).rejects.toThrow('TARGET_INVALID');
  });

  it('resolves request with target.workdir — sets workspace.cwd', async () => {
    const req = makeRequest({
      target: { namespace: 'default', workdir: '/tmp/work' },
    });
    const result = await resolveExecutionTarget(req, mockPlatform);
    expect(result.workspace?.cwd).toBe('/tmp/work');
    expect(result.workspace?.type).toBe('local');
  });

  it('workdir does not override existing workspace.type', async () => {
    const req = makeRequest({
      target: { namespace: 'default', workdir: '/tmp/work' },
      workspace: { type: 'ephemeral', cwd: '/old' },
    });
    const result = await resolveExecutionTarget(req, mockPlatform);
    expect(result.workspace?.type).toBe('ephemeral');
    expect(result.workspace?.cwd).toBe('/tmp/work');
  });

  it('resolves target.environmentId when no environmentManager — skips check', async () => {
    const req = makeRequest({
      target: { namespace: 'default', environmentId: 'env-123' },
    });
    // platform has no environmentManager — should succeed without error
    const result = await resolveExecutionTarget(req, mockPlatform);
    expect(result.descriptor.pluginId).toBe('@kb-labs/test');
  });

  it('throws when environmentManager reports terminated status', async () => {
    const req = makeRequest({
      target: { namespace: 'default', environmentId: 'env-dead' },
    });
    const platformWithEnv = {
      environmentManager: {
        getEnvironmentStatus: async () => ({ status: 'terminated' as const }),
      },
    } as unknown as PlatformServices;

    await expect(resolveExecutionTarget(req, platformWithEnv)).rejects.toThrow(
      'ENVIRONMENT_NOT_AVAILABLE',
    );
  });

  it('throws when environmentManager reports failed status', async () => {
    const req = makeRequest({
      target: { namespace: 'default', environmentId: 'env-fail' },
    });
    const platformWithEnv = {
      environmentManager: {
        getEnvironmentStatus: async () => ({ status: 'failed' as const }),
      },
    } as unknown as PlatformServices;

    await expect(resolveExecutionTarget(req, platformWithEnv)).rejects.toThrow(
      'ENVIRONMENT_NOT_AVAILABLE',
    );
  });

  it('passes when environmentManager reports ready status', async () => {
    const req = makeRequest({
      target: { namespace: 'default', environmentId: 'env-ok' },
    });
    const platformWithEnv = {
      environmentManager: {
        getEnvironmentStatus: async () => ({ status: 'ready' as const }),
      },
    } as unknown as PlatformServices;

    const result = await resolveExecutionTarget(req, platformWithEnv);
    expect(result.descriptor.pluginId).toBe('@kb-labs/test');
  });

  it('throws when workspaceManager reports released status', async () => {
    const req = makeRequest({
      target: { namespace: 'default', workspaceId: 'ws-gone' },
    });
    const platformWithWs = {
      workspaceManager: {
        getWorkspaceStatus: async () => ({ status: 'released' as const }),
      },
    } as unknown as PlatformServices;

    await expect(resolveExecutionTarget(req, platformWithWs)).rejects.toThrow(
      'WORKSPACE_NOT_AVAILABLE',
    );
  });

  it('throws when workspaceManager reports failed status', async () => {
    const req = makeRequest({
      target: { namespace: 'default', workspaceId: 'ws-fail' },
    });
    const platformWithWs = {
      workspaceManager: {
        getWorkspaceStatus: async () => ({ status: 'failed' as const }),
      },
    } as unknown as PlatformServices;

    await expect(resolveExecutionTarget(req, platformWithWs)).rejects.toThrow(
      'WORKSPACE_NOT_AVAILABLE',
    );
  });

  it('does not mutate original request', async () => {
    const req = makeRequest({
      target: { namespace: 'default', workdir: '/tmp/work' },
    });
    const original = JSON.stringify(req);
    await resolveExecutionTarget(req, mockPlatform);
    expect(JSON.stringify(req)).toBe(original);
  });
});
