import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockCLIInput, createCapturedUI, createMockContext } from '@kb-labs/sdk/testing';

vi.mock('@kb-labs/steward-core', () => ({
  addCompany: vi.fn(),
}));

import { addCompany } from '@kb-labs/steward-core';
import command from '../../commands/company-add.js';

const mockedAddCompany = vi.mocked(addCompany);

beforeEach(() => {
  mockedAddCompany.mockReset();
});

describe('steward:company.add', () => {
  it('adds a company', async () => {
    mockedAddCompany.mockResolvedValue({ id: 'co_1', name: 'Acme Corp', createdAt: 1, updatedAt: 1 });

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await command.execute(ctx, mockCLIInput({ flags: { name: 'Acme Corp' } }));

    expect(result.ok).toBe(true);
    expect(mockedAddCompany).toHaveBeenCalledWith({ name: 'Acme Corp' });
    expect(captured.infos[0]?.message).toContain('Acme Corp');
  });

  it('missing --name is a validation error', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await command.execute(ctx, mockCLIInput({ flags: {} }));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('INVALID_ARGS');
    }
    expect(mockedAddCompany).not.toHaveBeenCalled();
    expect(captured.errors.length).toBeGreaterThan(0);
  });
});
