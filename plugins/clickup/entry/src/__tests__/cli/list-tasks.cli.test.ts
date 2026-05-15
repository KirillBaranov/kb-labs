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

import { requireApiKey, getListTasks } from '@kb-labs/clickup-core';
import listTasksCommand from '../../commands/list-tasks.js';
import { mockTask } from '../helpers/fixtures.js';

// Use fixture task with a recognisable id for assertions
const mockTasks = [{ ...mockTask, id: 'task-1', name: 'Task One' }];

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireApiKey).mockReturnValue('test-api-key');
});

describe('clickup:list.tasks', () => {
  it('LT-01: lists tasks — exitCode 0, table rendered', async () => {
    vi.mocked(getListTasks).mockResolvedValue(mockTasks);

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await listTasksCommand.execute(
      ctx,
      mockCLIInput({ argv: ['list-1'], flags: {} }),
    );

    expect(result.exitCode).toBe(0);
    expect(captured.table.length).toBeGreaterThan(0);
    expect(vi.mocked(getListTasks)).toHaveBeenCalledWith('test-api-key', 'list-1', expect.any(Object));
  });

  it('LT-02: --json outputs tasks array', async () => {
    vi.mocked(getListTasks).mockResolvedValue(mockTasks);

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await listTasksCommand.execute(
      ctx,
      mockCLIInput({ argv: ['list-1'], flags: { json: true } }),
    );

    expect(result.exitCode).toBe(0);
    expect(Array.isArray(captured.json[0])).toBe(true);
    expect((captured.json[0] as typeof mockTasks)[0]).toMatchObject({ id: 'task-1' });
  });

  it('LT-03: empty task list — exitCode 0, info message shown', async () => {
    vi.mocked(getListTasks).mockResolvedValue([]);

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await listTasksCommand.execute(
      ctx,
      mockCLIInput({ argv: ['list-1'], flags: {} }),
    );

    expect(result.exitCode).toBe(0);
    expect(captured.infos.length).toBeGreaterThan(0);
  });

  it('LT-04: missing listId argv — exitCode 1, error shown', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await listTasksCommand.execute(
      ctx,
      mockCLIInput({ argv: [], flags: {} }),
    );

    expect(result.exitCode).toBe(1);
    expect(captured.errors.length).toBeGreaterThan(0);
  });

  it('LT-05: core function throws — exitCode 1, error shown', async () => {
    vi.mocked(getListTasks).mockRejectedValue(new Error('API error'));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await listTasksCommand.execute(
      ctx,
      mockCLIInput({ argv: ['list-1'], flags: {} }),
    );

    expect(result.exitCode).toBe(1);
    expect(captured.errors.length).toBeGreaterThan(0);
  });
});
