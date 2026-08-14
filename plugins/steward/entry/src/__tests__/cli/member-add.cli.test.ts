import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockCLIInput, createCapturedUI, createMockContext } from '@kb-labs/sdk/testing';

vi.mock('@kb-labs/steward-core', () => ({
  addMember: vi.fn(),
}));

import { addMember } from '@kb-labs/steward-core';
import command from '../../commands/member-add.js';

const mockedAddMember = vi.mocked(addMember);

beforeEach(() => {
  mockedAddMember.mockReset();
});

describe('steward:member.add', () => {
  it('links a person to a project with a role and priority', async () => {
    mockedAddMember.mockResolvedValue({
      id: 'mem_1',
      personId: 'per_1',
      projectId: 'prj_1',
      role: 'lead',
      priority: 0,
      createdAt: 1,
      updatedAt: 1,
    });

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await command.execute(
      ctx,
      mockCLIInput({ flags: { person: 'per_1', project: 'prj_1', role: 'lead', priority: 0 } }),
    );

    expect(result.ok).toBe(true);
    expect(mockedAddMember).toHaveBeenCalledWith({
      personId: 'per_1',
      projectId: 'prj_1',
      role: 'lead',
      topics: undefined,
      priority: 0,
    });
    expect(captured.infos[0]?.message).toContain('lead');
  });

  it('missing --person/--project/--role is a validation error', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await command.execute(ctx, mockCLIInput({ flags: {} }));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('INVALID_ARGS');
    }
    expect(mockedAddMember).not.toHaveBeenCalled();
    expect(captured.errors.length).toBeGreaterThan(0);
  });
});
