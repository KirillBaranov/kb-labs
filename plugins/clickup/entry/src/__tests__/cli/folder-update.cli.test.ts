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

import { requireApiKey, updateFolder } from '@kb-labs/clickup-core';
import folderUpdateCommand from '../../commands/folder-update.js';
import { mockFolder } from '../helpers/fixtures.js';

// Variant with updated name for update tests
const mockUpdatedFolder = { ...mockFolder, name: 'Updated Folder' };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireApiKey).mockReturnValue('test-api-key');
});

describe('clickup:folder.update', () => {
  it('FU-01: updates folder — exitCode 0, success message', async () => {
    vi.mocked(updateFolder).mockResolvedValue(mockUpdatedFolder);

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await folderUpdateCommand.execute(
      ctx,
      mockCLIInput({ argv: ['folder-1'], flags: { name: 'Updated Folder' } }),
    );

    expect(result.ok).toBe(true);
    expect(captured.success.length).toBeGreaterThan(0);
    expect(captured.success[0]?.message).toContain('Folder updated');
    expect(vi.mocked(updateFolder)).toHaveBeenCalledWith('test-api-key', 'folder-1', { name: 'Updated Folder' });
  });

  it('FU-02: --json outputs slim updated folder', async () => {
    vi.mocked(updateFolder).mockResolvedValue(mockUpdatedFolder);

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await folderUpdateCommand.execute(
      ctx,
      mockCLIInput({ argv: ['folder-1'], flags: { name: 'Updated Folder', json: true } }),
    );

    expect(result.ok).toBe(true);
    expect(captured.json[0]).toMatchObject({ id: 'folder-1', name: 'Updated Folder' });
    expect(Object.keys(captured.json[0] as object)).toEqual(['id', 'name']);
  });

  it('FU-02b: --json --full outputs raw updated folder', async () => {
    vi.mocked(updateFolder).mockResolvedValue(mockUpdatedFolder);

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await folderUpdateCommand.execute(
      ctx,
      mockCLIInput({ argv: ['folder-1'], flags: { name: 'Updated Folder', json: true, full: true } }),
    );

    expect(result.ok).toBe(true);
    const raw = captured.json[0] as typeof mockUpdatedFolder;
    expect(raw.lists).toBeDefined();
    expect(raw.orderindex).toBeDefined();
  });

  it('FU-03: missing folderId argv — exitCode 1, error shown', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await folderUpdateCommand.execute(
      ctx,
      mockCLIInput({ argv: [], flags: { name: 'Updated Folder' } }),
    );

    expect(result.ok).toBe(false);
    expect(captured.errors.length).toBeGreaterThan(0);
  });

  it('FU-04: missing --name — exitCode 1, error shown', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await folderUpdateCommand.execute(
      ctx,
      mockCLIInput({ argv: ['folder-1'], flags: {} }),
    );

    expect(result.ok).toBe(false);
    expect(captured.errors.length).toBeGreaterThan(0);
  });

  it('FU-05: core function throws — exitCode 1, error shown', async () => {
    vi.mocked(updateFolder).mockRejectedValue(new Error('API error'));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await folderUpdateCommand.execute(
      ctx,
      mockCLIInput({ argv: ['folder-1'], flags: { name: 'Updated Folder' } }),
    );

    expect(result.ok).toBe(false);
    expect(captured.errors.length).toBeGreaterThan(0);
  });

  it('FU-06: --dry-run shows intent, updateFolder is NOT called', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await folderUpdateCommand.execute(
      ctx,
      mockCLIInput({ argv: ['folder-1'], flags: { name: 'New Name', 'dry-run': true } }),
    );

    expect(result.ok).toBe(true);
    expect(vi.mocked(updateFolder)).not.toHaveBeenCalled();
    expect(captured.infos[0]?.message).toContain('Dry-run');
    expect(captured.infos[0]?.message).toContain('folder-1');
  });
});
