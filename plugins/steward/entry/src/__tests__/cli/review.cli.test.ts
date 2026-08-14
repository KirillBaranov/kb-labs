import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockCLIInput, createCapturedUI, createMockContext } from '@kb-labs/sdk/testing';

vi.mock('@kb-labs/steward-core', () => ({
  getDailyReview: vi.fn(),
}));

import { getDailyReview } from '@kb-labs/steward-core';
import command from '../../commands/review.js';

const mockedGetDailyReview = vi.mocked(getDailyReview);

beforeEach(() => {
  mockedGetDailyReview.mockReset();
});

describe('steward:review', () => {
  it('summarizes stale/upcoming commitments and backup health', async () => {
    mockedGetDailyReview.mockResolvedValue({
      generatedAt: 1,
      lastBackupDaysAgo: 2,
      staleCommitments: [
        { id: 'cmt_1', text: 'Overdue', status: 'open', staleAfterDays: 14, createdAt: 1, updatedAt: 1 },
      ],
      upcomingCommitments: [],
      activeProjects: [],
    });

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await command.execute(ctx, mockCLIInput({ flags: {} }));

    expect(result.ok).toBe(true);
    expect(captured.infos[0]?.message).toContain('2d ago');
    expect(captured.chain[0]).toHaveLength(1);
  });

  it('reports "never" when no backup has run', async () => {
    mockedGetDailyReview.mockResolvedValue({
      generatedAt: 1,
      lastBackupDaysAgo: null,
      staleCommitments: [],
      upcomingCommitments: [],
      activeProjects: [],
    });

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    await command.execute(ctx, mockCLIInput({ flags: {} }));

    expect(captured.infos[0]?.message).toMatch(/never/i);
  });

  it('--json emits the full review object', async () => {
    mockedGetDailyReview.mockResolvedValue({
      generatedAt: 1,
      lastBackupDaysAgo: 0,
      staleCommitments: [],
      upcomingCommitments: [],
      activeProjects: [],
    });

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    await command.execute(ctx, mockCLIInput({ flags: { json: true } }));

    expect(captured.json[0]).toMatchObject({ ok: true, result: { lastBackupDaysAgo: 0 } });
  });
});
