import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockCLIInput, createCapturedUI, createMockContext } from '@kb-labs/shared-testing-e2e/cli';

// Mock clickup-core before importing the command
vi.mock('@kb-labs/clickup-core', () => ({
  requireApiKey: vi.fn().mockReturnValue('test-api-key'),
  updateTask: vi.fn(),
  ClickUpApiError: class ClickUpApiError extends Error {
    constructor(public override message: string, public status: number, public code: string) {
      super(message);
    }
  },
}));

import { requireApiKey, updateTask } from '@kb-labs/clickup-core';
import taskUpdateCommand from '../../commands/task-update.js';
import { mockTask } from '../helpers/fixtures.js';

// Variant with updated name for update tests
const mockUpdatedTask = { ...mockTask, name: 'Updated Task' };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireApiKey).mockReturnValue('test-api-key');
});

describe('clickup:task.update', () => {
  it('TU-01: updates a task and prints success', async () => {
    vi.mocked(updateTask).mockResolvedValue(mockUpdatedTask);

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await taskUpdateCommand.execute(
      ctx,
      mockCLIInput({ argv: ['task-001'], flags: { name: 'Updated Task' } }),
    );

    expect(result.ok).toBe(true);
    expect(captured.success.length).toBeGreaterThan(0);
    expect(captured.success[0]?.message).toContain('Task updated');
  });

  it('TU-02: --json outputs slim updated task', async () => {
    vi.mocked(updateTask).mockResolvedValue(mockUpdatedTask);

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await taskUpdateCommand.execute(
      ctx,
      mockCLIInput({ argv: ['task-001'], flags: { name: 'Updated Task', json: true } }),
    );

    expect(result.ok).toBe(true);
    const slim = captured.json[0] as Record<string, unknown>;
    expect(slim.id).toBe('task-001');
    expect(typeof slim.status).toBe('string');
    expect(slim).not.toHaveProperty('date_created');
    expect(slim).not.toHaveProperty('assignees');
  });

  it('TU-02b: --json --full outputs raw updated task', async () => {
    vi.mocked(updateTask).mockResolvedValue(mockUpdatedTask);

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await taskUpdateCommand.execute(
      ctx,
      mockCLIInput({ argv: ['task-001'], flags: { name: 'Updated Task', json: true, full: true } }),
    );

    expect(result.ok).toBe(true);
    const raw = captured.json[0] as typeof mockUpdatedTask;
    expect(typeof raw.status).toBe('object');
    expect(raw.date_created).toBeDefined();
  });

  it('TU-03: missing taskId returns exitCode 1', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await taskUpdateCommand.execute(
      ctx,
      mockCLIInput({ argv: [] }),
    );

    expect(result.ok).toBe(false);
    expect(captured.errors.length).toBeGreaterThan(0);
  });

  it('TU-05: --dry-run shows intent, updateTask is NOT called', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await taskUpdateCommand.execute(
      ctx,
      mockCLIInput({ argv: ['task-001'], flags: { name: 'New Name', 'dry-run': true } }),
    );

    expect(result.ok).toBe(true);
    expect(vi.mocked(updateTask)).not.toHaveBeenCalled();
    expect(captured.infos[0]?.message).toContain('Dry-run');
    expect(captured.infos[0]?.message).toContain('task-001');
  });

  it('TU-04: core error returns exitCode 1', async () => {
    vi.mocked(updateTask).mockRejectedValue(new Error('Forbidden'));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await taskUpdateCommand.execute(
      ctx,
      mockCLIInput({ argv: ['task-001'], flags: { status: 'done' } }),
    );

    expect(result.ok).toBe(false);
    expect(captured.errors.length).toBeGreaterThan(0);
  });
});
