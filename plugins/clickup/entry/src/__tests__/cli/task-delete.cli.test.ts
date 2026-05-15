import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockCLIInput, createCapturedUI, createMockContext } from '@kb-labs/shared-testing-e2e';

// Mock clickup-core before importing the command
vi.mock('@kb-labs/clickup-core', () => ({
  requireApiKey: vi.fn().mockReturnValue('test-api-key'),
  deleteTask: vi.fn(),
  ClickUpApiError: class ClickUpApiError extends Error {
    constructor(public message: string, public status: number, public code: string) {
      super(message);
    }
  },
}));

import { requireApiKey, deleteTask } from '@kb-labs/clickup-core';
import taskDeleteCommand from '../../commands/task-delete.js';

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireApiKey).mockReturnValue('test-api-key');
});

describe('clickup:task.delete', () => {
  it('TD-01: deletes a task with --force and prints success', async () => {
    vi.mocked(deleteTask).mockResolvedValue(undefined);

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await taskDeleteCommand.execute(
      ctx,
      mockCLIInput({ argv: ['task-001'], flags: { force: true } }),
    );

    expect(result.exitCode).toBe(0);
    expect(captured.success.length).toBeGreaterThan(0);
    expect(captured.success[0]?.message).toContain('task-001');
  });

  it('TD-02: --json outputs { ok, deleted, taskId }', async () => {
    vi.mocked(deleteTask).mockResolvedValue(undefined);

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await taskDeleteCommand.execute(
      ctx,
      mockCLIInput({ argv: ['task-001'], flags: { force: true, json: true } }),
    );

    expect(result.exitCode).toBe(0);
    expect(captured.json[0]).toMatchObject({ ok: true, deleted: true, taskId: 'task-001' });
  });

  it('TD-03: missing taskId returns exitCode 1', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await taskDeleteCommand.execute(
      ctx,
      mockCLIInput({ argv: [], flags: { force: true } }),
    );

    expect(result.exitCode).toBe(1);
    expect(captured.errors.length).toBeGreaterThan(0);
  });

  it('TD-04: missing --force returns exitCode 1', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await taskDeleteCommand.execute(
      ctx,
      mockCLIInput({ argv: ['task-001'], flags: {} }),
    );

    expect(result.exitCode).toBe(1);
    expect(captured.errors.length).toBeGreaterThan(0);
  });

  it('TD-05: core error returns exitCode 1', async () => {
    vi.mocked(deleteTask).mockRejectedValue(new Error('Not found'));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await taskDeleteCommand.execute(
      ctx,
      mockCLIInput({ argv: ['task-001'], flags: { force: true } }),
    );

    expect(result.exitCode).toBe(1);
    expect(captured.errors.length).toBeGreaterThan(0);
  });
});
