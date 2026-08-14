import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockCLIInput, createCapturedUI, createMockContext } from '@kb-labs/sdk/testing';

vi.mock('@kb-labs/steward-core', () => ({
  addResource: vi.fn(),
}));

import { addResource } from '@kb-labs/steward-core';
import command from '../../commands/resource-add.js';

const mockedAddResource = vi.mocked(addResource);

beforeEach(() => {
  mockedAddResource.mockReset();
});

describe('steward:resource.add', () => {
  it('attaches a resource to a project', async () => {
    mockedAddResource.mockResolvedValue({
      id: 'res_1',
      projectId: 'prj_1',
      type: 'repo',
      label: 'Repo',
      url: 'https://example.com',
      createdAt: 1,
      updatedAt: 1,
    });

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await command.execute(
      ctx,
      mockCLIInput({ argv: ['prj_1'], flags: { type: 'repo', label: 'Repo', url: 'https://example.com' } }),
    );

    expect(result.ok).toBe(true);
    expect(mockedAddResource).toHaveBeenCalledWith({
      projectId: 'prj_1',
      type: 'repo',
      label: 'Repo',
      url: 'https://example.com',
      content: undefined,
    });
    expect(captured.infos[0]?.message).toContain('Repo');
  });

  it('missing projectId/type/label is a validation error', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await command.execute(ctx, mockCLIInput({ argv: [] }));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('INVALID_ARGS');
    }
    expect(mockedAddResource).not.toHaveBeenCalled();
    expect(captured.errors.length).toBeGreaterThan(0);
  });

  it('requires at least one of --url/--content', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await command.execute(
      ctx,
      mockCLIInput({ argv: ['prj_1'], flags: { type: 'repo', label: 'Repo' } }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('INVALID_ARGS');
    }
    expect(mockedAddResource).not.toHaveBeenCalled();
    expect(captured.errors.length).toBeGreaterThan(0);
  });
});
