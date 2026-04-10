import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEnvironmentAPI, createNoopEnvironmentAPI } from '../api/environment.js';

describe('EnvironmentAPI', () => {
  let manager: {
    createEnvironment: ReturnType<typeof vi.fn>;
    getEnvironmentStatus: ReturnType<typeof vi.fn>;
    destroyEnvironment: ReturnType<typeof vi.fn>;
    renewEnvironmentLease: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    manager = {
      createEnvironment: vi.fn(),
      getEnvironmentStatus: vi.fn(),
      destroyEnvironment: vi.fn(),
      renewEnvironmentLease: vi.fn(),
    };
  });

  it('creates environment with full permission', async () => {
    manager.createEnvironment.mockResolvedValue({
      environmentId: 'env-1',
      provider: 'docker',
      status: 'ready',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    const api = createEnvironmentAPI({
      manager,
      permissions: {
        platform: {
          environment: true,
        },
      },
    });

    const created = await api.create({ templateId: 'node-dev' });

    expect(created.environmentId).toBe('env-1');
    expect(manager.createEnvironment).toHaveBeenCalledWith({ templateId: 'node-dev' });
  });

  it('checks status with read permission', async () => {
    manager.getEnvironmentStatus.mockResolvedValue({
      environmentId: 'env-1',
      status: 'ready',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    const api = createEnvironmentAPI({
      manager,
      permissions: {
        platform: {
          environment: {
            read: true,
          },
        },
      },
    });

    const status = await api.status('env-1');
    expect(status.status).toBe('ready');
    expect(manager.getEnvironmentStatus).toHaveBeenCalledWith('env-1');
  });

  it('destroys environment with destroy permission', async () => {
    manager.destroyEnvironment.mockResolvedValue(undefined);

    const api = createEnvironmentAPI({
      manager,
      permissions: {
        platform: {
          environment: {
            destroy: true,
          },
        },
      },
    });

    await api.destroy('env-1', 'manual_cleanup');
    expect(manager.destroyEnvironment).toHaveBeenCalledWith('env-1', 'manual_cleanup');
  });

  it('renews lease with renewLease permission', async () => {
    manager.renewEnvironmentLease.mockResolvedValue({
      leaseId: 'lease-1',
      acquiredAt: '2026-01-01T00:00:00.000Z',
      expiresAt: '2026-01-01T01:00:00.000Z',
    });

    const api = createEnvironmentAPI({
      manager,
      permissions: {
        platform: {
          environment: {
            renewLease: true,
          },
        },
      },
    });

    const lease = await api.renewLease('env-1', 60_000);
    expect(lease.leaseId).toBe('lease-1');
    expect(manager.renewEnvironmentLease).toHaveBeenCalledWith('env-1', 60_000);
  });

  it('denies create without platform.environment permission', async () => {
    const api = createEnvironmentAPI({
      manager,
      permissions: {},
    });

    await expect(api.create({ templateId: 'node-dev' })).rejects.toThrow(
      'Environment access denied: missing platform.environment permission'
    );
  });

  it('denies specific operation when flag is missing', async () => {
    const api = createEnvironmentAPI({
      manager,
      permissions: {
        platform: {
          environment: {
            create: true,
          },
        },
      },
    });

    await expect(api.destroy('env-1')).rejects.toThrow(
      "Environment operation 'destroy' denied: missing platform.environment.destroy permission"
    );
  });

  it('enforces create template scope when templates are set', async () => {
    const api = createEnvironmentAPI({
      manager,
      permissions: {
        platform: {
          environment: {
            create: true,
            templates: ['node-*'],
          },
        },
      },
    });

    await expect(api.create({ templateId: 'python-dev' })).rejects.toThrow(
      "Environment template 'python-dev' denied: not in allowed templates scope"
    );
  });

  it('allows create template by wildcard scope', async () => {
    manager.createEnvironment.mockResolvedValue({
      environmentId: 'env-2',
      provider: 'docker',
      status: 'ready',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    const api = createEnvironmentAPI({
      manager,
      permissions: {
        platform: {
          environment: {
            create: true,
            templates: ['node-*'],
          },
        },
      },
    });

    const created = await api.create({ templateId: 'node-ts' });
    expect(created.environmentId).toBe('env-2');
  });

  it('enforces namespace scope on create', async () => {
    const api = createEnvironmentAPI({
      manager,
      permissions: {
        platform: {
          environment: {
            create: true,
            namespaces: ['team-a/*'],
          },
        },
      },
    });

    await expect(
      api.create({ templateId: 'node-dev', namespace: 'team-b/dev' })
    ).rejects.toThrow(
      "Environment namespace 'team-b/dev' denied: not in allowed namespaces scope"
    );
  });

  it('noop API reports unavailable manager', async () => {
    const api = createNoopEnvironmentAPI();

    await expect(api.create({})).rejects.toThrow(
      'Environment manager not available in this context'
    );
    await expect(api.status('env-1')).rejects.toThrow(
      'Environment manager not available in this context'
    );
    await expect(api.destroy('env-1')).rejects.toThrow(
      'Environment manager not available in this context'
    );
    await expect(api.renewLease('env-1', 1_000)).rejects.toThrow(
      'Environment manager not available in this context'
    );
  });
});
