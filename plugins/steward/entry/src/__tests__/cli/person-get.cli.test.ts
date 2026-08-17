import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockCLIInput, createCapturedUI, createMockContext } from '@kb-labs/sdk/testing';

vi.mock('@kb-labs/steward-core', () => ({
  getPerson: vi.fn(),
}));

import { getPerson } from '@kb-labs/steward-core';
import command from '../../commands/person-get.js';

const mockedGetPerson = vi.mocked(getPerson);

beforeEach(() => {
  mockedGetPerson.mockReset();
});

describe('steward:person.get', () => {
  it('returns a matching person', async () => {
    mockedGetPerson.mockResolvedValue({
      id: 'per_1',
      name: 'Ivanov',
      contacts: [],
      globalTopics: ['frontend'],
      createdAt: 1,
      updatedAt: 1,
    });

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await command.execute(ctx, mockCLIInput({ argv: ['Ivanov'] }));

    expect(result.ok).toBe(true);
    expect(captured.infos[0]?.message).toContain('Ivanov');
  });

  it('not found — NOT_FOUND', async () => {
    mockedGetPerson.mockResolvedValue(null);

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await command.execute(ctx, mockCLIInput({ argv: ['missing'] }));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('NOT_FOUND');
    }
    expect(captured.errors.length).toBeGreaterThan(0);
  });

  it('missing idOrName is a validation error', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await command.execute(ctx, mockCLIInput({ argv: [] }));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('INVALID_ARGS');
    }
    expect(mockedGetPerson).not.toHaveBeenCalled();
    expect(captured.errors.length).toBeGreaterThan(0);
  });
});
