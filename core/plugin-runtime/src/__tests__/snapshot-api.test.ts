import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSnapshotAPI, createNoopSnapshotAPI } from '../api/snapshot.js';

describe('SnapshotAPI', () => {
  let manager: {
    captureSnapshot: ReturnType<typeof vi.fn>;
    restoreSnapshot: ReturnType<typeof vi.fn>;
    getSnapshotStatus: ReturnType<typeof vi.fn>;
    deleteSnapshot: ReturnType<typeof vi.fn>;
    garbageCollectSnapshots: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    manager = {
      captureSnapshot: vi.fn(),
      restoreSnapshot: vi.fn(),
      getSnapshotStatus: vi.fn(),
      deleteSnapshot: vi.fn(),
      garbageCollectSnapshots: vi.fn(),
    };
  });

  it('captures snapshot with full permission', async () => {
    manager.captureSnapshot.mockResolvedValue({
      snapshotId: 'snap-1',
      provider: 'fs',
      status: 'ready',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    const api = createSnapshotAPI({
      manager,
      permissions: {
        platform: {
          snapshot: true,
        },
      },
    });

    const snapshot = await api.capture({ namespace: 'runs/main' });
    expect(snapshot.snapshotId).toBe('snap-1');
    expect(manager.captureSnapshot).toHaveBeenCalledWith({ namespace: 'runs/main' });
  });

  it('enforces namespace scope on capture', async () => {
    const api = createSnapshotAPI({
      manager,
      permissions: {
        platform: {
          snapshot: {
            capture: true,
            namespaces: ['runs/*'],
          },
        },
      },
    });

    await expect(api.capture({ namespace: 'other/main' })).rejects.toThrow(
      "Snapshot namespace 'other/main' denied: not in allowed namespaces scope"
    );
  });

  it('enforces namespace scope on gc', async () => {
    const api = createSnapshotAPI({
      manager,
      permissions: {
        platform: {
          snapshot: {
            garbageCollect: true,
            namespaces: ['runs/*'],
          },
        },
      },
    });

    await expect(api.gc({ namespace: 'other/main' })).rejects.toThrow(
      "Snapshot namespace 'other/main' denied: not in allowed namespaces scope"
    );
  });

  it('denies restore when permission is missing', async () => {
    const api = createSnapshotAPI({
      manager,
      permissions: {
        platform: {
          snapshot: {
            read: true,
          },
        },
      },
    });

    await expect(api.restore({ snapshotId: 'snap-1' })).rejects.toThrow(
      "Snapshot operation 'restore' denied: missing platform.snapshot.restore permission"
    );
  });

  it('noop API reports unavailable manager', async () => {
    const api = createNoopSnapshotAPI();
    await expect(api.capture({})).rejects.toThrow(
      'Snapshot manager not available in this context'
    );
    await expect(api.gc()).rejects.toThrow(
      'Snapshot manager not available in this context'
    );
  });
});
