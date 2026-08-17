import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockCLIInput, createCapturedUI, createMockContext } from '@kb-labs/sdk/testing';

vi.mock('@kb-labs/steward-core', () => ({
  listResources: vi.fn(),
}));

import { listResources } from '@kb-labs/steward-core';
import command from '../../commands/resource-list.js';

const mockedListResources = vi.mocked(listResources);

beforeEach(() => {
  mockedListResources.mockReset();
});

describe('steward:resource.list', () => {
  it('lists resources for a project', async () => {
    mockedListResources.mockResolvedValue([
      { id: 'res_1', projectId: 'prj_1', type: 'repo', label: 'Repo', url: 'https://x', createdAt: 1, updatedAt: 1 },
    ]);

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await command.execute(ctx, mockCLIInput({ argv: ['prj_1'] }));

    expect(result.ok).toBe(true);
    expect(mockedListResources).toHaveBeenCalledWith('prj_1');
    expect(captured.chain[0]).toHaveLength(1);
  });

  it('prints a friendly message with no resources', async () => {
    mockedListResources.mockResolvedValue([]);

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    await command.execute(ctx, mockCLIInput({ argv: ['prj_1'] }));

    expect(captured.infos[0]?.message).toMatch(/no resources/i);
  });

  it('missing projectId is a validation error', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await command.execute(ctx, mockCLIInput({ argv: [] }));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('INVALID_ARGS');
    }
    expect(mockedListResources).not.toHaveBeenCalled();
    expect(captured.errors.length).toBeGreaterThan(0);
  });
});
