import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockCLIInput, createCapturedUI, createMockContext } from '@kb-labs/sdk/testing';

vi.mock('@kb-labs/steward-core', () => ({
  getProject: vi.fn(),
}));

import { getProject } from '@kb-labs/steward-core';
import command from '../../commands/project-get.js';

const mockedGetProject = vi.mocked(getProject);

beforeEach(() => {
  mockedGetProject.mockReset();
});

describe('steward:project.get', () => {
  it('returns the project card', async () => {
    const project = { id: 'prj_1', name: 'Acme API', status: 'active' as const, createdAt: 1, updatedAt: 1 };
    mockedGetProject.mockResolvedValue({ project, resources: [], members: [] });

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await command.execute(ctx, mockCLIInput({ argv: ['prj_1'] }));

    expect(result.ok).toBe(true);
    expect(captured.infos[0]?.message).toContain('Acme API');
  });

  it('--json emits the full card', async () => {
    const project = { id: 'prj_1', name: 'Acme API', status: 'active' as const, createdAt: 1, updatedAt: 1 };
    mockedGetProject.mockResolvedValue({ project, resources: [], members: [] });

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    await command.execute(ctx, mockCLIInput({ argv: ['prj_1'], flags: { json: true } }));

    expect(captured.json[0]).toMatchObject({ ok: true, result: { project: { id: 'prj_1' } } });
  });

  it('not found — NOT_FOUND, exitOk false', async () => {
    mockedGetProject.mockResolvedValue(null);

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
    expect(mockedGetProject).not.toHaveBeenCalled();
    expect(captured.errors.length).toBeGreaterThan(0);
  });
});
