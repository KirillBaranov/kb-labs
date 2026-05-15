import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockCLIInput, createCapturedUI, createMockContext } from '@kb-labs/shared-testing-e2e';

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

import { requireApiKey, createFolder } from '@kb-labs/clickup-core';
import folderCreateCommand from '../../commands/folder-create.js';
import { mockFolder } from '../helpers/fixtures.js';

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireApiKey).mockReturnValue('test-api-key');
});

describe('clickup:folder.create', () => {
  it('FC-01: creates folder — exitCode 0, success message', async () => {
    vi.mocked(createFolder).mockResolvedValue(mockFolder);

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await folderCreateCommand.execute(
      ctx,
      mockCLIInput({ flags: { space: 'space-1', name: 'My Folder' } }),
    );

    expect(result.exitCode).toBe(0);
    expect(captured.success.length).toBeGreaterThan(0);
    expect(captured.success[0]?.message).toContain('Folder created');
    expect(vi.mocked(createFolder)).toHaveBeenCalledWith('test-api-key', 'space-1', { name: 'My Folder' });
  });

  it('FC-02: --json outputs folder object', async () => {
    vi.mocked(createFolder).mockResolvedValue(mockFolder);

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await folderCreateCommand.execute(
      ctx,
      mockCLIInput({ flags: { space: 'space-1', name: 'My Folder', json: true } }),
    );

    expect(result.exitCode).toBe(0);
    expect(captured.json[0]).toMatchObject({ id: 'folder-1', name: 'My Folder' });
  });

  it('FC-03: missing --space — exitCode 1, error shown', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await folderCreateCommand.execute(
      ctx,
      mockCLIInput({ flags: { name: 'My Folder' } }),
    );

    expect(result.exitCode).toBe(1);
    expect(captured.errors.length).toBeGreaterThan(0);
  });

  it('FC-04: missing --name — exitCode 1, error shown', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await folderCreateCommand.execute(
      ctx,
      mockCLIInput({ flags: { space: 'space-1' } }),
    );

    expect(result.exitCode).toBe(1);
    expect(captured.errors.length).toBeGreaterThan(0);
  });

  it('FC-05: core function throws — exitCode 1, error shown', async () => {
    vi.mocked(createFolder).mockRejectedValue(new Error('API error'));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await folderCreateCommand.execute(
      ctx,
      mockCLIInput({ flags: { space: 'space-1', name: 'My Folder' } }),
    );

    expect(result.exitCode).toBe(1);
    expect(captured.errors.length).toBeGreaterThan(0);
  });
});
