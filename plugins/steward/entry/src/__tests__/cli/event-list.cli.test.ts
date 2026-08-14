import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockCLIInput, createCapturedUI, createMockContext } from '@kb-labs/sdk/testing';

vi.mock('@kb-labs/steward-core', () => ({
  listEvents: vi.fn(),
}));

import { listEvents } from '@kb-labs/steward-core';
import command from '../../commands/event-list.js';

const mockedListEvents = vi.mocked(listEvents);

beforeEach(() => {
  mockedListEvents.mockReset();
});

describe('steward:event.list', () => {
  it('reads the history log for a subject', async () => {
    mockedListEvents.mockResolvedValue([
      {
        id: 'evt_1',
        at: 1700000000000,
        kind: 'note',
        subjectType: 'project',
        subjectId: 'prj_1',
        text: 'hi',
        createdAt: 1,
        updatedAt: 1,
      },
    ]);

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await command.execute(
      ctx,
      mockCLIInput({ flags: { 'subject-type': 'project', 'subject-id': 'prj_1' } }),
    );

    expect(result.ok).toBe(true);
    expect(mockedListEvents).toHaveBeenCalledWith({
      subjectType: 'project',
      subjectId: 'prj_1',
      kind: undefined,
    });
    expect(captured.chain[0]).toHaveLength(1);
  });

  it('prints a friendly message with no events', async () => {
    mockedListEvents.mockResolvedValue([]);

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    await command.execute(ctx, mockCLIInput({ flags: {} }));

    expect(captured.infos[0]?.message).toMatch(/no events/i);
  });
});
