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

    expect(result.ok).toBe(true);
    expect(captured.success.length).toBeGreaterThan(0);
    expect(captured.success[0]?.message).toContain('Folder created');
    expect(vi.mocked(createFolder)).toHaveBeenCalledWith('test-api-key', 'space-1', { name: 'My Folder' });
  });

  it('FC-02: --json outputs slim folder object', async () => {
    vi.mocked(createFolder).mockResolvedValue(mockFolder);

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await folderCreateCommand.execute(
      ctx,
      mockCLIInput({ flags: { space: 'space-1', name: 'My Folder', json: true } }),
    );

    expect(result.ok).toBe(true);
    expect(captured.json[0]).toMatchObject({ id: 'folder-1', name: 'My Folder' });
    expect(Object.keys(captured.json[0] as object)).toEqual(['id', 'name']);
  });

  it('FC-02b: --json --full outputs raw folder object', async () => {
    vi.mocked(createFolder).mockResolvedValue(mockFolder);

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await folderCreateCommand.execute(
      ctx,
      mockCLIInput({ flags: { space: 'space-1', name: 'My Folder', json: true, full: true } }),
    );

    expect(result.ok).toBe(true);
    const raw = captured.json[0] as typeof mockFolder;
    expect(raw.lists).toBeDefined();
    expect(raw.orderindex).toBeDefined();
  });

  it('FC-03: missing --space — exitCode 1, error shown', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await folderCreateCommand.execute(
      ctx,
      mockCLIInput({ flags: { name: 'My Folder' } }) as Parameters<typeof folderCreateCommand.execute>[1],
    );

    expect(result.ok).toBe(false);
    expect(captured.errors.length).toBeGreaterThan(0);
  });

  it('FC-04: missing --name — exitCode 1, error shown', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await folderCreateCommand.execute(
      ctx,
      mockCLIInput({ flags: { space: 'space-1' } }) as Parameters<typeof folderCreateCommand.execute>[1],
    );

    expect(result.ok).toBe(false);
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

    expect(result.ok).toBe(false);
    expect(captured.errors.length).toBeGreaterThan(0);
  });

  it('FC-06: --dry-run shows intent, createFolder is NOT called', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await folderCreateCommand.execute(
      ctx,
      mockCLIInput({ flags: { space: 'space-1', name: 'My Folder', 'dry-run': true } }),
    );

    expect(result.ok).toBe(true);
    expect(vi.mocked(createFolder)).not.toHaveBeenCalled();
    expect(captured.infos[0]?.message).toContain('Dry-run');
    expect(captured.infos[0]?.message).toContain('My Folder');
  });
});
