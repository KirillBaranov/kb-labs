import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockCLIInput, createCapturedUI, createMockContext } from '@kb-labs/sdk/testing';

vi.mock('@kb-labs/steward-core', () => ({
  commitmentDrop: vi.fn(),
}));

import { commitmentDrop } from '@kb-labs/steward-core';
import command from '../../commands/commitment-drop.js';

const mockedCommitmentDrop = vi.mocked(commitmentDrop);

beforeEach(() => {
  mockedCommitmentDrop.mockReset();
});

describe('steward:commitment.drop', () => {
  it('drops a commitment with a reason', async () => {
    mockedCommitmentDrop.mockResolvedValue({
      id: 'cmt_1',
      text: 'Send X',
      status: 'dropped',
      staleAfterDays: 14,
      createdAt: 1,
      updatedAt: 2,
    });

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await command.execute(
      ctx,
      mockCLIInput({ argv: ['cmt_1'], flags: { reason: 'No longer relevant' } }),
    );

    expect(result.ok).toBe(true);
    expect(mockedCommitmentDrop).toHaveBeenCalledWith({ id: 'cmt_1', reason: 'No longer relevant' });
    expect(captured.infos[0]?.message).toContain('No longer relevant');
  });

  it('not found — NOT_FOUND', async () => {
    mockedCommitmentDrop.mockResolvedValue(null);

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await command.execute(
      ctx,
      mockCLIInput({ argv: ['missing'], flags: { reason: 'x' } }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('NOT_FOUND');
    }
    expect(captured.errors.length).toBeGreaterThan(0);
  });

  it('missing --reason is a validation error', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await command.execute(ctx, mockCLIInput({ argv: ['cmt_1'] }));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('INVALID_ARGS');
    }
    expect(mockedCommitmentDrop).not.toHaveBeenCalled();
    expect(captured.errors.length).toBeGreaterThan(0);
  });
});
