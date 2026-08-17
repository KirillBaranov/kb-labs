import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockCLIInput, createCapturedUI, createMockContext } from '@kb-labs/shared-testing-e2e/cli';

// Mock @kb-labs/clickup-core before importing the command
vi.mock('@kb-labs/clickup-core', () => ({
  requireApiKey: vi.fn().mockReturnValue('test-api-key'),
  requireTeamId: vi.fn().mockReturnValue('team-123'),
  getWorkspaceHierarchy: vi.fn(),
  createFolder: vi.fn(),
  updateFolder: vi.fn(),
  deleteFolder: vi.fn(),
  createListInFolder: vi.fn(),
  createListInSpace: vi.fn(),
  updateList: vi.fn(),
  deleteList: vi.fn(),
  getListTasks: vi.fn(),
  getListStatuses: vi.fn(),
  createSpace: vi.fn(),
  updateSpace: vi.fn(),
  deleteSpace: vi.fn(),
  ClickUpApiError: class ClickUpApiError extends Error { status = 0; code = ''; },
}));

import { requireApiKey, deleteFolder } from '@kb-labs/clickup-core';
import folderDeleteCommand from '../../commands/folder-delete.js';

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireApiKey).mockReturnValue('test-api-key');
});

describe('clickup:folder.delete', () => {
  it('FD-01: deletes folder with --force — exitCode 0, success message', async () => {
    vi.mocked(deleteFolder).mockResolvedValue(undefined);

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await folderDeleteCommand.execute(
      ctx,
      mockCLIInput({ argv: ['folder-1'], flags: { force: true } }),
    );

    expect(result.ok).toBe(true);
    expect(captured.success.length).toBeGreaterThan(0);
    expect(vi.mocked(deleteFolder)).toHaveBeenCalledWith('test-api-key', 'folder-1');
  });

  it('FD-02: --json outputs { ok: true, deleted: true, folderId }', async () => {
    vi.mocked(deleteFolder).mockResolvedValue(undefined);

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await folderDeleteCommand.execute(
      ctx,
      mockCLIInput({ argv: ['folder-1'], flags: { force: true, json: true } }),
    );

    expect(result.ok).toBe(true);
    expect(captured.json[0]).toMatchObject({ ok: true, deleted: true, folderId: 'folder-1' });
  });

  it('FD-03: missing folderId argv — exitCode 1, error shown', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await folderDeleteCommand.execute(
      ctx,
      mockCLIInput({ argv: [], flags: { force: true } }),
    );

    expect(result.ok).toBe(false);
    expect(captured.errors.length).toBeGreaterThan(0);
  });

  it('FD-04: missing --force — exitCode 1, error shown', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await folderDeleteCommand.execute(
      ctx,
      mockCLIInput({ argv: ['folder-1'], flags: {} }),
    );

    expect(result.ok).toBe(false);
    expect(captured.errors.length).toBeGreaterThan(0);
  });

  it('FD-05: core function throws — exitCode 1, error shown', async () => {
    vi.mocked(deleteFolder).mockRejectedValue(new Error('API error'));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await folderDeleteCommand.execute(
      ctx,
      mockCLIInput({ argv: ['folder-1'], flags: { force: true } }),
    );

    expect(result.ok).toBe(false);
    expect(captured.errors.length).toBeGreaterThan(0);
  });

  it('FD-06: --dry-run shows intent, deleteFolder is NOT called', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await folderDeleteCommand.execute(
      ctx,
      mockCLIInput({ argv: ['folder-1'], flags: { 'dry-run': true } }),
    );

    expect(result.ok).toBe(true);
    expect(vi.mocked(deleteFolder)).not.toHaveBeenCalled();
    expect(captured.infos[0]?.message).toContain('Dry-run');
    expect(captured.infos[0]?.message).toContain('folder-1');
  });
});
