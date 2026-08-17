import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockCLIInput, createCapturedUI, createMockContext } from '@kb-labs/shared-testing-e2e/cli';

// Mock clickup-core before importing the command
vi.mock('@kb-labs/clickup-core', () => ({
  requireApiKey: vi.fn().mockReturnValue('test-api-key'),
  addTaskComment: vi.fn(),
  ClickUpApiError: class ClickUpApiError extends Error {
    constructor(public override message: string, public status: number, public code: string) {
      super(message);
    }
  },
}));

import { requireApiKey, addTaskComment } from '@kb-labs/clickup-core';
import taskCommentAddCommand from '../../commands/task-comment-add.js';
import { mockComment, mockCommentCreateResult } from '../helpers/fixtures.js';

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireApiKey).mockReturnValue('test-api-key');
});

describe('clickup:task comments add', () => {
  it('TCA-01: adds a comment and prints success', async () => {
    vi.mocked(addTaskComment).mockResolvedValue(mockComment);

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await taskCommentAddCommand.execute(
      ctx,
      mockCLIInput({ argv: ['task-001'], flags: { text: 'Hello world' } }),
    );

    expect(result.ok).toBe(true);
    expect(captured.success.length).toBeGreaterThan(0);
    expect(captured.success[0]?.message).toContain('Comment added');
  });

  it('TCA-02: --json outputs slim comment object when API returns the sparse create-comment shape', async () => {
    // ClickUp's real POST /task/{id}/comment response has no `user`/`comment_text`/`resolved` —
    // regression test for INTERNAL_ERROR: "Cannot read properties of undefined (reading 'username')"
    vi.mocked(addTaskComment).mockResolvedValue(mockCommentCreateResult);

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await taskCommentAddCommand.execute(
      ctx,
      mockCLIInput({ argv: ['task-001'], flags: { text: 'Hello world', json: true } }),
    );

    expect(result.ok).toBe(true);
    const slim = captured.json[0] as Record<string, unknown>;
    expect(slim.id).toBe('comment-1');
    expect(slim).not.toHaveProperty('user');
    expect(slim).not.toHaveProperty('resolved');
    expect(slim).not.toHaveProperty('comment');
  });

  it('TCA-02b: --json outputs slim comment object including user when API returns it', async () => {
    vi.mocked(addTaskComment).mockResolvedValue(mockComment);

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await taskCommentAddCommand.execute(
      ctx,
      mockCLIInput({ argv: ['task-001'], flags: { text: 'Hello world', json: true } }),
    );

    expect(result.ok).toBe(true);
    const slim = captured.json[0] as Record<string, unknown>;
    expect(slim.id).toBe('comment-1');
    expect(typeof slim.user).toBe('string');
    expect(slim).not.toHaveProperty('resolved');
    expect(slim).not.toHaveProperty('comment');
  });

  it('TCA-02c: --json --full outputs raw comment object', async () => {
    vi.mocked(addTaskComment).mockResolvedValue(mockComment);

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await taskCommentAddCommand.execute(
      ctx,
      mockCLIInput({ argv: ['task-001'], flags: { text: 'Hello world', json: true, full: true } }),
    );

    expect(result.ok).toBe(true);
    const raw = captured.json[0] as typeof mockComment;
    expect(typeof raw.user).toBe('object');
    expect(raw.resolved).toBeDefined();
  });

  it('TCA-03: missing taskId returns exitCode 1', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await taskCommentAddCommand.execute(
      ctx,
      mockCLIInput({ argv: [], flags: { text: 'Hello world' } }),
    );

    expect(result.ok).toBe(false);
    expect(captured.errors.length).toBeGreaterThan(0);
  });

  it('TCA-04: missing --text returns exitCode 1', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await taskCommentAddCommand.execute(
      ctx,
      mockCLIInput({ argv: ['task-001'], flags: {} }),
    );

    expect(result.ok).toBe(false);
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

    expect(result.ok).toBe(false);
    expect(captured.errors.length).toBeGreaterThan(0);
  });

  it('TCA-06: --dry-run shows intent, addTaskComment is NOT called', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await taskCommentAddCommand.execute(
      ctx,
      mockCLIInput({ argv: ['task-001'], flags: { text: 'Hello', 'dry-run': true } }),
    );

    expect(result.ok).toBe(true);
    expect(vi.mocked(addTaskComment)).not.toHaveBeenCalled();
    expect(captured.infos[0]?.message).toContain('Dry-run');
    expect(captured.infos[0]?.message).toContain('task-001');
  });
});
