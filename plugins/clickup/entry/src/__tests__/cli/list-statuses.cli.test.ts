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

import { requireApiKey, getListStatuses } from '@kb-labs/clickup-core';
import listStatusesCommand from '../../commands/list-statuses.js';
import { mockStatuses } from '../helpers/fixtures.js';

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireApiKey).mockReturnValue('test-api-key');
});

describe('clickup:list.statuses', () => {
  it('LS-01: lists statuses — exitCode 0, table rendered', async () => {
    vi.mocked(getListStatuses).mockResolvedValue(mockStatuses);

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await listStatusesCommand.execute(
      ctx,
      mockCLIInput({ argv: ['list-1'], flags: {} }),
    );

    expect(result.exitCode).toBe(0);
    expect(captured.table.length).toBeGreaterThan(0);
    expect(vi.mocked(getListStatuses)).toHaveBeenCalledWith('test-api-key', 'list-1');
  });

  it('LS-02: --json outputs statuses array', async () => {
    vi.mocked(getListStatuses).mockResolvedValue(mockStatuses);

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await listStatusesCommand.execute(
      ctx,
      mockCLIInput({ argv: ['list-1'], flags: { json: true } }),
    );

    expect(result.exitCode).toBe(0);
    expect(Array.isArray(captured.json[0])).toBe(true);
    expect((captured.json[0] as typeof mockStatuses)[0]).toMatchObject({ status: 'open' });
  });

  it('LS-03: missing listId argv — exitCode 1, error shown', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await listStatusesCommand.execute(
      ctx,
      mockCLIInput({ argv: [], flags: {} }),
    );

    expect(result.exitCode).toBe(1);
    expect(captured.errors.length).toBeGreaterThan(0);
  });

  it('LS-04: core function throws — exitCode 1, error shown', async () => {
    vi.mocked(getListStatuses).mockRejectedValue(new Error('API error'));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await listStatusesCommand.execute(
      ctx,
      mockCLIInput({ argv: ['list-1'], flags: {} }),
    );

    expect(result.exitCode).toBe(1);
    expect(captured.errors.length).toBeGreaterThan(0);
  });
});
