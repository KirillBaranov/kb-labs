import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockCLIInput, createCapturedUI, createMockContext } from '@kb-labs/sdk/testing';

vi.mock('@kb-labs/steward-core', () => ({
  listCompanies: vi.fn(),
}));

import { listCompanies } from '@kb-labs/steward-core';
import command from '../../commands/company-list.js';

const mockedListCompanies = vi.mocked(listCompanies);

beforeEach(() => {
  mockedListCompanies.mockReset();
});

describe('steward:company.list', () => {
  it('lists companies', async () => {
    mockedListCompanies.mockResolvedValue([{ id: 'co_1', name: 'Acme Corp', createdAt: 1, updatedAt: 1 }]);

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await command.execute(ctx, mockCLIInput({ flags: {} }));

    expect(result.ok).toBe(true);
    expect(captured.chain[0]).toHaveLength(1);
  });

  it('prints a friendly message with no companies', async () => {
    mockedListCompanies.mockResolvedValue([]);

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    await command.execute(ctx, mockCLIInput({ flags: {} }));

    expect(captured.infos[0]?.message).toMatch(/no companies/i);
  });
});
