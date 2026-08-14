import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockCLIInput, createCapturedUI, createMockContext } from '@kb-labs/sdk/testing';

vi.mock('@kb-labs/steward-core', () => ({
  addProject: vi.fn(),
}));

import { addProject } from '@kb-labs/steward-core';
import command from '../../commands/project-add.js';

const mockedAddProject = vi.mocked(addProject);

beforeEach(() => {
  mockedAddProject.mockReset();
});

describe('steward:project.add', () => {
  it('creates a project and prints a confirmation', async () => {
    mockedAddProject.mockResolvedValue({
      id: 'prj_1',
      name: 'Acme API',
      status: 'active',
      createdAt: 1,
      updatedAt: 1,
    });

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await command.execute(ctx, mockCLIInput({ flags: { name: 'Acme API' } }));

    expect(result.ok).toBe(true);
    expect(mockedAddProject).toHaveBeenCalledWith({ name: 'Acme API', status: 'active', description: undefined });
    expect(captured.infos[0]?.message).toContain('Acme API');
  });

  it('--json emits a structured result', async () => {
    mockedAddProject.mockResolvedValue({
      id: 'prj_1',
      name: 'Acme API',
      status: 'active',
      createdAt: 1,
      updatedAt: 1,
    });

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    await command.execute(ctx, mockCLIInput({ flags: { name: 'Acme API', json: true } }));

    expect(captured.json[0]).toMatchObject({ ok: true, result: { id: 'prj_1' } });
  });

  it('missing --name is a validation error', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await command.execute(ctx, mockCLIInput({ flags: {} }));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('INVALID_ARGS');
    }
    expect(mockedAddProject).not.toHaveBeenCalled();
    expect(captured.errors.length).toBeGreaterThan(0);
  });
});
