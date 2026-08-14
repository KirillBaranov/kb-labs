import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockCLIInput, createCapturedUI, createMockContext } from '@kb-labs/sdk/testing';

vi.mock('@kb-labs/steward-core', () => ({
  addPerson: vi.fn(),
}));

import { addPerson } from '@kb-labs/steward-core';
import command from '../../commands/person-add.js';

const mockedAddPerson = vi.mocked(addPerson);

beforeEach(() => {
  mockedAddPerson.mockReset();
});

describe('steward:person.add', () => {
  it('adds a person and forwards parsed topics', async () => {
    mockedAddPerson.mockResolvedValue({
      person: { id: 'per_1', name: 'Ivanov', contacts: [], globalTopics: ['frontend'], createdAt: 1, updatedAt: 1 },
      possibleDuplicates: [],
    });

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await command.execute(ctx, mockCLIInput({ flags: { name: 'Ivanov', topics: 'frontend, architecture' } }));

    expect(result.ok).toBe(true);
    expect(mockedAddPerson).toHaveBeenCalledWith({
      name: 'Ivanov',
      contacts: [],
      companyId: undefined,
      globalTopics: ['frontend', 'architecture'],
    });
    expect(captured.infos[0]?.message).toContain('Ivanov');
    expect(captured.warnings).toEqual([]);
  });

  it('warns (not errors) on a possible duplicate', async () => {
    mockedAddPerson.mockResolvedValue({
      person: { id: 'per_2', name: 'Ivanov', contacts: [], globalTopics: [], createdAt: 1, updatedAt: 1 },
      possibleDuplicates: [{ id: 'per_1', name: 'Ivanov', contacts: [], globalTopics: [], createdAt: 0, updatedAt: 0 }],
    });

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await command.execute(ctx, mockCLIInput({ flags: { name: 'Ivanov' } }));

    expect(result.ok).toBe(true);
    expect(captured.warnings.length).toBeGreaterThan(0);
    expect(captured.errors).toEqual([]);
  });

  it('missing --name is a validation error', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await command.execute(ctx, mockCLIInput({ flags: {} }));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('INVALID_ARGS');
    }
    expect(mockedAddPerson).not.toHaveBeenCalled();
    expect(captured.errors.length).toBeGreaterThan(0);
  });
});
