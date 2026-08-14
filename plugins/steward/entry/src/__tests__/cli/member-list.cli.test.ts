import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockCLIInput, createCapturedUI, createMockContext } from '@kb-labs/sdk/testing';

vi.mock('@kb-labs/steward-core', () => ({
  listMembers: vi.fn(),
}));

import { listMembers } from '@kb-labs/steward-core';
import command from '../../commands/member-list.js';

const mockedListMembers = vi.mocked(listMembers);

beforeEach(() => {
  mockedListMembers.mockReset();
});

describe('steward:member.list', () => {
  it('lists members of a project', async () => {
    mockedListMembers.mockResolvedValue([
      { id: 'mem_1', personId: 'per_1', projectId: 'prj_1', role: 'lead', priority: 0, createdAt: 1, updatedAt: 1 },
    ]);

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await command.execute(ctx, mockCLIInput({ argv: ['prj_1'] }));

    expect(result.ok).toBe(true);
    expect(mockedListMembers).toHaveBeenCalledWith('prj_1');
    expect(captured.chain[0]).toHaveLength(1);
  });

  it('missing projectId is a validation error', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await command.execute(ctx, mockCLIInput({ argv: [] }));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('INVALID_ARGS');
    }
    expect(mockedListMembers).not.toHaveBeenCalled();
    expect(captured.errors.length).toBeGreaterThan(0);
  });
});
