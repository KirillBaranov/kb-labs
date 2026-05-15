import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockCLIInput, createCapturedUI, createMockContext } from '@kb-labs/shared-testing-e2e';

// Mock @kb-labs/clickup-core before importing the command
vi.mock('@kb-labs/clickup-core', () => ({
  requireApiKey: vi.fn().mockReturnValue('test-api-key'),
  requireTeamId: vi.fn().mockReturnValue('team-123'),
  getWorkspaceHierarchy: vi.fn(),
  createFolder: vi.fn(),
  updateFolder: vi.fn(),
  deleteFolder: vi.fn(),
  createListInFolder: vi.fn(),
  createListInSpace: vi.fn(),
  updateList: vi.fn(),
  deleteList: vi.fn(),
  getListTasks: vi.fn(),
  getListStatuses: vi.fn(),
  createSpace: vi.fn(),
  updateSpace: vi.fn(),
  deleteSpace: vi.fn(),
  ClickUpApiError: class ClickUpApiError extends Error { status = 0; code = ''; },
}));

import { requireApiKey, requireTeamId, createSpace } from '@kb-labs/clickup-core';
import spaceCreateCommand from '../../commands/space-create.js';
import { mockSpaceDetail } from '../helpers/fixtures.js';

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireApiKey).mockReturnValue('test-api-key');
  vi.mocked(requireTeamId).mockReturnValue('team-123');
});

describe('clickup:space.create', () => {
  it('SC-01: creates space — exitCode 0, success message', async () => {
    vi.mocked(createSpace).mockResolvedValue(mockSpaceDetail);

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await spaceCreateCommand.execute(
      ctx,
      mockCLIInput({ flags: { name: 'My Space' } }),
    );

    expect(result.exitCode).toBe(0);
    expect(captured.success.length).toBeGreaterThan(0);
    expect(captured.success[0]?.message).toContain('Space created');
    expect(vi.mocked(createSpace)).toHaveBeenCalledWith(
      'test-api-key',
      'team-123',
      expect.objectContaining({ name: 'My Space' }),
    );
  });

  it('SC-02: --json outputs space object', async () => {
    vi.mocked(createSpace).mockResolvedValue(mockSpaceDetail);

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await spaceCreateCommand.execute(
      ctx,
      mockCLIInput({ flags: { name: 'My Space', json: true } }),
    );

    expect(result.exitCode).toBe(0);
    expect(captured.json[0]).toMatchObject({ id: 'space-1', name: 'My Space' });
  });

  it('SC-03: missing --name — exitCode 1, error shown', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await spaceCreateCommand.execute(
      ctx,
      mockCLIInput({ flags: {} }),
    );

    expect(result.exitCode).toBe(1);
    expect(captured.errors.length).toBeGreaterThan(0);
  });

  it('SC-04: core function throws — exitCode 1, error shown', async () => {
    vi.mocked(createSpace).mockRejectedValue(new Error('API error'));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await spaceCreateCommand.execute(
      ctx,
      mockCLIInput({ flags: { name: 'My Space' } }),
    );

    expect(result.exitCode).toBe(1);
    expect(captured.errors.length).toBeGreaterThan(0);
  });
});
