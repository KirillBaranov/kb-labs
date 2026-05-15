import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockCLIInput, createCapturedUI, createMockContext } from '@kb-labs/shared-testing-e2e';

// Mock clickup-core before importing the command
vi.mock('@kb-labs/clickup-core', () => ({
  requireApiKey: vi.fn().mockReturnValue('test-api-key'),
  updateTask: vi.fn(),
  ClickUpApiError: class ClickUpApiError extends Error {
    constructor(public message: string, public status: number, public code: string) {
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

    expect(result.exitCode).toBe(0);
    expect(captured.success.length).toBeGreaterThan(0);
    expect(captured.success[0]?.message).toContain('Task updated');
  });

  it('TU-02: --json outputs updated task', async () => {
    vi.mocked(updateTask).mockResolvedValue(mockUpdatedTask);

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await taskUpdateCommand.execute(
      ctx,
      mockCLIInput({ argv: ['task-001'], flags: { name: 'Updated Task', json: true } }),
    );

    expect(result.exitCode).toBe(0);
    expect(captured.json[0]).toMatchObject({ id: 'task-001' });
  });

  it('TU-03: missing taskId returns exitCode 1', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await taskUpdateCommand.execute(
      ctx,
      mockCLIInput({ argv: [] }),
    );

    expect(result.exitCode).toBe(1);
    expect(captured.errors.length).toBeGreaterThan(0);
  });

  it('TU-04: core error returns exitCode 1', async () => {
    vi.mocked(updateTask).mockRejectedValue(new Error('Forbidden'));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await taskUpdateCommand.execute(
      ctx,
      mockCLIInput({ argv: ['task-001'], flags: { status: 'done' } }),
    );

    expect(result.exitCode).toBe(1);
    expect(captured.errors.length).toBeGreaterThan(0);
  });
});
