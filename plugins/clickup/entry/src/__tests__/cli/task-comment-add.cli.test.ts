import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockCLIInput, createCapturedUI, createMockContext } from '@kb-labs/shared-testing-e2e';

// Mock clickup-core before importing the command
vi.mock('@kb-labs/clickup-core', () => ({
  requireApiKey: vi.fn().mockReturnValue('test-api-key'),
  addTaskComment: vi.fn(),
  ClickUpApiError: class ClickUpApiError extends Error {
    constructor(public message: string, public status: number, public code: string) {
      super(message);
    }
  },
}));

import { requireApiKey, addTaskComment } from '@kb-labs/clickup-core';
import taskCommentAddCommand from '../../commands/task-comment-add.js';
import { mockComment } from '../helpers/fixtures.js';

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireApiKey).mockReturnValue('test-api-key');
});

describe('clickup:task.comment.add', () => {
  it('TCA-01: adds a comment and prints success', async () => {
    vi.mocked(addTaskComment).mockResolvedValue(mockComment);

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await taskCommentAddCommand.execute(
      ctx,
      mockCLIInput({ argv: ['task-001'], flags: { text: 'Hello world' } }),
    );

    expect(result.exitCode).toBe(0);
    expect(captured.success.length).toBeGreaterThan(0);
    expect(captured.success[0]?.message).toContain('Comment added');
  });

  it('TCA-02: --json outputs comment object', async () => {
    vi.mocked(addTaskComment).mockResolvedValue(mockComment);

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await taskCommentAddCommand.execute(
      ctx,
      mockCLIInput({ argv: ['task-001'], flags: { text: 'Hello world', json: true } }),
    );

    expect(result.exitCode).toBe(0);
    expect(captured.json[0]).toMatchObject({ id: 'comment-1' });
  });

  it('TCA-03: missing taskId returns exitCode 1', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await taskCommentAddCommand.execute(
      ctx,
      mockCLIInput({ argv: [], flags: { text: 'Hello world' } }),
    );

    expect(result.exitCode).toBe(1);
    expect(captured.errors.length).toBeGreaterThan(0);
  });

  it('TCA-04: missing --text returns exitCode 1', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await taskCommentAddCommand.execute(
      ctx,
      mockCLIInput({ argv: ['task-001'], flags: {} }),
    );

    expect(result.exitCode).toBe(1);
    expect(captured.errors.length).toBeGreaterThan(0);
  });

  it('TCA-05: core error returns exitCode 1', async () => {
    vi.mocked(addTaskComment).mockRejectedValue(new Error('API error'));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await taskCommentAddCommand.execute(
      ctx,
      mockCLIInput({ argv: ['task-001'], flags: { text: 'Hello world' } }),
    );

    expect(result.exitCode).toBe(1);
    expect(captured.errors.length).toBeGreaterThan(0);
  });
});
