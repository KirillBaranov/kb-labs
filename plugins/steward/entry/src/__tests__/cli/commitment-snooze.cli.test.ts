import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockCLIInput, createCapturedUI, createMockContext } from '@kb-labs/sdk/testing';

vi.mock('@kb-labs/steward-core', () => ({
  commitmentSnooze: vi.fn(),
}));

import { commitmentSnooze } from '@kb-labs/steward-core';
import command from '../../commands/commitment-snooze.js';

const mockedCommitmentSnooze = vi.mocked(commitmentSnooze);

beforeEach(() => {
  mockedCommitmentSnooze.mockReset();
});

describe('steward:commitment.snooze', () => {
  it('snoozes a commitment, parsing the ISO date', async () => {
    mockedCommitmentSnooze.mockResolvedValue({
      id: 'cmt_1',
      text: 'Send X',
      status: 'open',
      staleAfterDays: 14,
      snoozedUntil: Date.parse('2026-09-15'),
      createdAt: 1,
      updatedAt: 2,
    });

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await command.execute(
      ctx,
      mockCLIInput({ argv: ['cmt_1'], flags: { until: '2026-09-15', reason: 'Waiting on client' } }),
    );

    expect(result.ok).toBe(true);
    expect(mockedCommitmentSnooze).toHaveBeenCalledWith({
      id: 'cmt_1',
      until: Date.parse('2026-09-15'),
      reason: 'Waiting on client',
    });
    expect(captured.infos[0]?.message).toContain('Send X');
  });

  it('not found — NOT_FOUND', async () => {
    mockedCommitmentSnooze.mockResolvedValue(null);

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await command.execute(
      ctx,
      mockCLIInput({ argv: ['missing'], flags: { until: '2026-09-15' } }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('NOT_FOUND');
    }
    expect(captured.errors.length).toBeGreaterThan(0);
  });

  it('missing --until is a validation error', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await command.execute(ctx, mockCLIInput({ argv: ['cmt_1'] }));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('INVALID_ARGS');
    }
    expect(mockedCommitmentSnooze).not.toHaveBeenCalled();
    expect(captured.errors.length).toBeGreaterThan(0);
  });
});
