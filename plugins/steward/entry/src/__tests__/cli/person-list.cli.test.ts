import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockCLIInput, createCapturedUI, createMockContext } from '@kb-labs/sdk/testing';

vi.mock('@kb-labs/steward-core', () => ({
  listPeople: vi.fn(),
}));

import { listPeople } from '@kb-labs/steward-core';
import command from '../../commands/person-list.js';

const mockedListPeople = vi.mocked(listPeople);

beforeEach(() => {
  mockedListPeople.mockReset();
});

describe('steward:person.list', () => {
  it('lists every contact', async () => {
    mockedListPeople.mockResolvedValue([
      { id: 'per_1', name: 'Ivanov', contacts: [], globalTopics: [], createdAt: 1, updatedAt: 1 },
    ]);

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await command.execute(ctx, mockCLIInput({ flags: {} }));

    expect(result.ok).toBe(true);
    expect(captured.chain[0]).toHaveLength(1);
  });

  it('--json emits the raw array', async () => {
    mockedListPeople.mockResolvedValue([]);

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    await command.execute(ctx, mockCLIInput({ flags: { json: true } }));

    expect(captured.json[0]).toMatchObject({ ok: true, result: [] });
  });

  it('prints a friendly message with no contacts', async () => {
    mockedListPeople.mockResolvedValue([]);

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    await command.execute(ctx, mockCLIInput({ flags: {} }));

    expect(captured.infos[0]?.message).toMatch(/no contacts/i);
  });
});
