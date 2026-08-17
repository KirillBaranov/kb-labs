import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockCLIInput, createCapturedUI, createMockContext } from '@kb-labs/sdk/testing';

vi.mock('@kb-labs/steward-core', () => ({
  commitmentDone: vi.fn(),
}));

import { commitmentDone } from '@kb-labs/steward-core';
import command from '../../commands/commitment-done.js';

const mockedCommitmentDone = vi.mocked(commitmentDone);

beforeEach(() => {
  mockedCommitmentDone.mockReset();
});

describe('steward:commitment.done', () => {
  it('marks a commitment done', async () => {
    mockedCommitmentDone.mockResolvedValue({
      id: 'cmt_1',
      text: 'Send X',
      status: 'done',
      staleAfterDays: 14,
      createdAt: 1,
      updatedAt: 2,
    });

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await command.execute(ctx, mockCLIInput({ argv: ['cmt_1'] }));

    expect(result.ok).toBe(true);
    expect(mockedCommitmentDone).toHaveBeenCalledWith({ id: 'cmt_1' });
    expect(captured.infos[0]?.message).toContain('Send X');
  });

  it('not found — NOT_FOUND', async () => {
    mockedCommitmentDone.mockResolvedValue(null);

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await command.execute(ctx, mockCLIInput({ argv: ['missing'] }));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('NOT_FOUND');
    }
    expect(captured.errors.length).toBeGreaterThan(0);
  });

  it('missing id is a validation error', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await command.execute(ctx, mockCLIInput({ argv: [] }));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('INVALID_ARGS');
    }
    expect(mockedCommitmentDone).not.toHaveBeenCalled();
    expect(captured.errors.length).toBeGreaterThan(0);
  });
});
