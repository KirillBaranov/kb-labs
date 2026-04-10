import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorkspaceAPI, createNoopWorkspaceAPI } from '../api/workspace.js';

describe('WorkspaceAPI', () => {
  let manager: {
    materializeWorkspace: ReturnType<typeof vi.fn>;
    attachWorkspace: ReturnType<typeof vi.fn>;
    releaseWorkspace: ReturnType<typeof vi.fn>;
    getWorkspaceStatus: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    manager = {
      materializeWorkspace: vi.fn(),
      attachWorkspace: vi.fn(),
      releaseWorkspace: vi.fn(),
      getWorkspaceStatus: vi.fn(),
    };
  });

  it('materializes workspace with full permission', async () => {
    manager.materializeWorkspace.mockResolvedValue({
      workspaceId: 'ws-1',
      provider: 'local',
      status: 'ready',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    const api = createWorkspaceAPI({
      manager,
      permissions: {
        platform: {
          workspace: true,
        },
      },
    });

    const created = await api.materialize({ sourceRef: 'repo://main' });
    expect(created.workspaceId).toBe('ws-1');
    expect(manager.materializeWorkspace).toHaveBeenCalledWith({ sourceRef: 'repo://main' });
  });

  it('enforces source scope on materialize', async () => {
    const api = createWorkspaceAPI({
      manager,
      permissions: {
        platform: {
          workspace: {
            materialize: true,
            sources: ['repo://trusted-*'],
          },
        },
      },
    });

    await expect(api.materialize({ sourceRef: 'repo://untrusted' })).rejects.toThrow(
      "Workspace source 'repo://untrusted' denied: not in allowed sources scope"
    );
  });

  it('enforces namespace scope on materialize', async () => {
    const api = createWorkspaceAPI({
      manager,
      permissions: {
        platform: {
          workspace: {
            materialize: true,
            namespaces: ['team-a/*'],
          },
        },
      },
    });

    await expect(
      api.materialize({ sourceRef: 'repo://main', namespace: 'team-b/dev' })
    ).rejects.toThrow(
      "Workspace namespace 'team-b/dev' denied: not in allowed namespaces scope"
    );
  });

  it('enforces path scope on attach', async () => {
    const api = createWorkspaceAPI({
      manager,
      permissions: {
        platform: {
          workspace: {
            attach: true,
            paths: ['/workspace/*'],
          },
        },
      },
    });

    await expect(
      api.attach({
        workspaceId: 'ws-1',
        environmentId: 'env-1',
        mountPath: '/forbidden/path',
      })
    ).rejects.toThrow(
      "Workspace path '/forbidden/path' denied: not in allowed paths scope"
    );
  });

  it('denies release when permission is missing', async () => {
    const api = createWorkspaceAPI({
      manager,
      permissions: {
        platform: {
          workspace: {
            read: true,
          },
        },
      },
    });

    await expect(api.release('ws-1')).rejects.toThrow(
      "Workspace operation 'release' denied: missing platform.workspace.release permission"
    );
  });

  it('noop API reports unavailable manager', async () => {
    const api = createNoopWorkspaceAPI();
    await expect(api.materialize({})).rejects.toThrow(
      'Workspace manager not available in this context'
    );
    await expect(api.status('ws-1')).rejects.toThrow(
      'Workspace manager not available in this context'
    );
  });
});
