import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockCLIInput, createCapturedUI, createMockContext } from '@kb-labs/shared-testing-e2e';

// Mock clickup-core before importing the command
vi.mock('@kb-labs/clickup-core', () => ({
  requireApiKey: vi.fn().mockReturnValue('test-api-key'),
  createTask: vi.fn(),
  ClickUpApiError: class ClickUpApiError extends Error {
    constructor(public message: string, public status: number, public code: string) {
      super(message);
    }
  },
}));

import { requireApiKey, createTask } from '@kb-labs/clickup-core';
import taskCreateCommand from '../../commands/task-create.js';
import { mockTask } from '../helpers/fixtures.js';

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireApiKey).mockReturnValue('test-api-key');
});

describe('clickup:task.create', () => {
  it('TC-01: creates a task and prints success', async () => {
    vi.mocked(createTask).mockResolvedValue(mockTask);

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await taskCreateCommand.execute(
      ctx,
      mockCLIInput({ flags: { list: 'list-1', name: 'My Task' } }),
    );

    expect(result.exitCode).toBe(0);
    expect(captured.success.length).toBeGreaterThan(0);
    expect(captured.success[0]?.message).toContain('Task created');
  });

  it('TC-02: --json outputs task object', async () => {
    vi.mocked(createTask).mockResolvedValue(mockTask);

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await taskCreateCommand.execute(
      ctx,
      mockCLIInput({ flags: { list: 'list-1', name: 'My Task', json: true } }),
    );

    expect(result.exitCode).toBe(0);
    expect(captured.json[0]).toMatchObject({ id: 'task-001' });
  });

  it('TC-03: missing --list returns exitCode 1', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await taskCreateCommand.execute(
      ctx,
      mockCLIInput({ flags: { name: 'My Task' } }),
    );

    expect(result.exitCode).toBe(1);
    expect(captured.errors.length).toBeGreaterThan(0);
  });

  it('TC-04: missing --name returns exitCode 1', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await taskCreateCommand.execute(
      ctx,
      mockCLIInput({ flags: { list: 'list-1' } }),
    );

    expect(result.exitCode).toBe(1);
    expect(captured.errors.length).toBeGreaterThan(0);
  });

  it('TC-05: core error returns exitCode 1', async () => {
    vi.mocked(createTask).mockRejectedValue(new Error('API error'));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await taskCreateCommand.execute(
      ctx,
      mockCLIInput({ flags: { list: 'list-1', name: 'My Task' } }),
    );

    expect(result.exitCode).toBe(1);
    expect(captured.errors.length).toBeGreaterThan(0);
  });
});
