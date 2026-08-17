import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockCLIInput, createCapturedUI, createMockContext } from '@kb-labs/sdk/testing';

vi.mock('@kb-labs/steward-core', () => ({
  updatePerson: vi.fn(),
}));

import { updatePerson } from '@kb-labs/steward-core';
import command from '../../commands/person-update.js';

const mockedUpdatePerson = vi.mocked(updatePerson);

beforeEach(() => {
  mockedUpdatePerson.mockReset();
});

describe('steward:person.update', () => {
  it('updates a contact and forwards parsed topics', async () => {
    mockedUpdatePerson.mockResolvedValue({
      id: 'per_1',
      name: 'Ivanov',
      contacts: [],
      globalTopics: ['backend'],
      createdAt: 1,
      updatedAt: 2,
    });

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await command.execute(ctx, mockCLIInput({ argv: ['per_1'], flags: { topics: 'backend' } }));

    expect(result.ok).toBe(true);
    expect(mockedUpdatePerson).toHaveBeenCalledWith({
      id: 'per_1',
      name: undefined,
      globalTopics: ['backend'],
      companyId: undefined,
    });
    expect(captured.infos[0]?.message).toContain('Ivanov');
  });

  it('not found — NOT_FOUND', async () => {
    mockedUpdatePerson.mockResolvedValue(null);

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await command.execute(ctx, mockCLIInput({ argv: ['missing'], flags: { name: 'X' } }));

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
    expect(mockedUpdatePerson).not.toHaveBeenCalled();
    expect(captured.errors.length).toBeGreaterThan(0);
  });
});
