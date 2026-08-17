import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockCLIInput, createCapturedUI, createMockContext } from '@kb-labs/sdk/testing';

vi.mock('@kb-labs/steward-core', () => ({
  addCommitment: vi.fn(),
}));

import { addCommitment } from '@kb-labs/steward-core';
import command from '../../commands/commitment-add.js';

const mockedAddCommitment = vi.mocked(addCommitment);

beforeEach(() => {
  mockedAddCommitment.mockReset();
});

describe('steward:commitment.add', () => {
  it('records a commitment and parses the ISO reminder date', async () => {
    mockedAddCommitment.mockResolvedValue({
      id: 'cmt_1',
      text: 'Send X',
      personId: 'per_1',
      status: 'open',
      staleAfterDays: 14,
      createdAt: 1,
      updatedAt: 1,
    });

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await command.execute(
      ctx,
      mockCLIInput({ flags: { text: 'Send X', person: 'per_1', 'remind-at': '2026-09-01' } }),
    );

    expect(result.ok).toBe(true);
    expect(mockedAddCommitment).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Send X', personId: 'per_1', staleAfterDays: 14 }),
    );
    expect(captured.infos[0]?.message).toContain('Send X');
  });

  it('an invalid --remind-at date is a validation error via handleError', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await command.execute(
      ctx,
      mockCLIInput({ flags: { text: 'Send X', 'remind-at': 'not-a-date' } }),
    );

    expect(result.ok).toBe(false);
    expect(captured.errors.length).toBeGreaterThan(0);
  });

  it('missing --text is a validation error', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await command.execute(ctx, mockCLIInput({ flags: {} }));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('INVALID_ARGS');
    }
    expect(mockedAddCommitment).not.toHaveBeenCalled();
    expect(captured.errors.length).toBeGreaterThan(0);
  });
});
