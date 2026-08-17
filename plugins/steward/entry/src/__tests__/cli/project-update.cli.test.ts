import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockCLIInput, createCapturedUI, createMockContext } from '@kb-labs/sdk/testing';

vi.mock('@kb-labs/steward-core', () => ({
  updateProject: vi.fn(),
}));

import { updateProject } from '@kb-labs/steward-core';
import command from '../../commands/project-update.js';

const mockedUpdateProject = vi.mocked(updateProject);

beforeEach(() => {
  mockedUpdateProject.mockReset();
});

describe('steward:project.update', () => {
  it('updates a project', async () => {
    mockedUpdateProject.mockResolvedValue({
      id: 'prj_1',
      name: 'Acme API',
      status: 'paused',
      createdAt: 1,
      updatedAt: 2,
    });

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await command.execute(ctx, mockCLIInput({ argv: ['prj_1'], flags: { status: 'paused' } }));

    expect(result.ok).toBe(true);
    expect(mockedUpdateProject).toHaveBeenCalledWith({ id: 'prj_1', status: 'paused', description: undefined });
    expect(captured.infos[0]?.message).toContain('paused');
  });

  it('not found — NOT_FOUND', async () => {
    mockedUpdateProject.mockResolvedValue(null);

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await command.execute(ctx, mockCLIInput({ argv: ['missing'], flags: { status: 'paused' } }));

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
    expect(mockedUpdateProject).not.toHaveBeenCalled();
    expect(captured.errors.length).toBeGreaterThan(0);
  });
});
