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

import { requireApiKey, updateList } from '@kb-labs/clickup-core';
import listUpdateCommand from '../../commands/list-update.js';
import { mockList } from '../helpers/fixtures.js';

// Variant with updated name for update tests
const mockUpdatedList = { ...mockList, name: 'Updated List' };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireApiKey).mockReturnValue('test-api-key');
});

describe('clickup:list.update', () => {
  it('LU-01: updates list — exitCode 0, success message', async () => {
    vi.mocked(updateList).mockResolvedValue(mockUpdatedList);

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await listUpdateCommand.execute(
      ctx,
      mockCLIInput({ argv: ['list-1'], flags: { name: 'Updated List' } }),
    );

    expect(result.ok).toBe(true);
    expect(captured.success.length).toBeGreaterThan(0);
    expect(captured.success[0]?.message).toContain('List updated');
    expect(vi.mocked(updateList)).toHaveBeenCalledWith('test-api-key', 'list-1', { name: 'Updated List' });
  });

  it('LU-02: --json outputs slim updated list', async () => {
    vi.mocked(updateList).mockResolvedValue(mockUpdatedList);

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await listUpdateCommand.execute(
      ctx,
      mockCLIInput({ argv: ['list-1'], flags: { name: 'Updated List', json: true } }),
    );

    expect(result.ok).toBe(true);
    expect(captured.json[0]).toMatchObject({ id: 'list-1', name: 'Updated List' });
    expect(Object.keys(captured.json[0] as object)).toEqual(['id', 'name']);
  });

  it('LU-02b: --json --full outputs raw updated list', async () => {
    vi.mocked(updateList).mockResolvedValue(mockUpdatedList);

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await listUpdateCommand.execute(
      ctx,
      mockCLIInput({ argv: ['list-1'], flags: { name: 'Updated List', json: true, full: true } }),
    );

    expect(result.ok).toBe(true);
    const raw = captured.json[0] as typeof mockUpdatedList;
    expect(raw.orderindex).toBeDefined();
    expect(raw.taskCount).toBeDefined();
  });

  it('LU-03: missing listId argv — exitCode 1, error shown', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await listUpdateCommand.execute(
      ctx,
      mockCLIInput({ argv: [], flags: { name: 'Updated List' } }),
    );

    expect(result.ok).toBe(false);
    expect(captured.errors.length).toBeGreaterThan(0);
  });

  it('LU-04: core function throws — exitCode 1, error shown', async () => {
    vi.mocked(updateList).mockRejectedValue(new Error('API error'));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await listUpdateCommand.execute(
      ctx,
      mockCLIInput({ argv: ['list-1'], flags: { name: 'Updated List' } }),
    );

    expect(result.ok).toBe(false);
    expect(captured.errors.length).toBeGreaterThan(0);
  });

  it('LU-05: --dry-run shows intent, updateList is NOT called', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await listUpdateCommand.execute(
      ctx,
      mockCLIInput({ argv: ['list-1'], flags: { name: 'New Name', 'dry-run': true } }),
    );

    expect(result.ok).toBe(true);
    expect(vi.mocked(updateList)).not.toHaveBeenCalled();
    expect(captured.infos[0]?.message).toContain('Dry-run');
    expect(captured.infos[0]?.message).toContain('list-1');
  });
});
