import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockCLIInput, createCapturedUI, createMockContext } from '@kb-labs/shared-testing-e2e/cli';

// Mock clickup-core before importing the command
vi.mock('@kb-labs/clickup-core', () => ({
  requireApiKey: vi.fn().mockReturnValue('test-api-key'),
  requireTeamId: vi.fn().mockReturnValue('team-123'),
  searchTasks: vi.fn(),
  ClickUpApiError: class ClickUpApiError extends Error {
    constructor(public override message: string, public status: number, public code: string) {
      super(message);
    }
  },
}));

import { requireApiKey, requireTeamId, searchTasks } from '@kb-labs/clickup-core';
import taskSearchCommand from '../../commands/task-search.js';
import { mockTask } from '../helpers/fixtures.js';

const mockTasks = [{ ...mockTask, id: 'task-001', name: 'Fix bug' }];

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireApiKey).mockReturnValue('test-api-key');
  vi.mocked(requireTeamId).mockReturnValue('team-123');
});

describe('clickup:task.search', () => {
  it('TS-01: returns tasks and renders chain', async () => {
    vi.mocked(searchTasks).mockResolvedValue(mockTasks);

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await taskSearchCommand.execute(
      ctx,
      mockCLIInput({ argv: ['bug'] }),
    );

    expect(result.ok).toBe(true);
  });

  it('TS-02: --json outputs slim tasks array', async () => {
    vi.mocked(searchTasks).mockResolvedValue(mockTasks);

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await taskSearchCommand.execute(
      ctx,
      mockCLIInput({ argv: ['bug'], flags: { json: true } }),
    );

    expect(result.ok).toBe(true);
    expect(Array.isArray(captured.json[0])).toBe(true);
    const slim = (captured.json[0] as Array<Record<string, unknown>>)[0]!;
    expect(slim.id).toBe('task-001');
    expect(typeof slim.status).toBe('string');
    expect(slim).toHaveProperty('due_date');
    expect(slim).toHaveProperty('url');
    expect(slim).not.toHaveProperty('assignees');
    expect(slim).not.toHaveProperty('date_created');
  });

  it('TS-02b: --json --full outputs raw tasks array', async () => {
    vi.mocked(searchTasks).mockResolvedValue(mockTasks);

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await taskSearchCommand.execute(
      ctx,
      mockCLIInput({ argv: ['bug'], flags: { json: true, full: true } }),
    );

    expect(result.ok).toBe(true);
    const raw = (captured.json[0] as typeof mockTasks)[0]!;
    expect(typeof raw.status).toBe('object');
    expect(raw.date_created).toBeDefined();
  });

  it('TS-03: empty results prints info message', async () => {
    vi.mocked(searchTasks).mockResolvedValue([]);

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await taskSearchCommand.execute(
      ctx,
      mockCLIInput({ argv: ['nothing'] }),
    );

    expect(result.ok).toBe(true);
    expect(captured.infos.length).toBeGreaterThan(0);
  });

  it('TS-04: core error returns exitCode 1', async () => {
    vi.mocked(searchTasks).mockRejectedValue(new Error('Unauthorized'));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await taskSearchCommand.execute(
      ctx,
      mockCLIInput({ argv: [] }),
    );

    expect(result.ok).toBe(false);
    expect(captured.errors.length).toBeGreaterThan(0);
  });
});
