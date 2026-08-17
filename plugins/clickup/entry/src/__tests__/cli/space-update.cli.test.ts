import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockCLIInput, createCapturedUI, createMockContext } from '@kb-labs/shared-testing-e2e/cli';

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

import { requireApiKey, updateSpace } from '@kb-labs/clickup-core';
import spaceUpdateCommand from '../../commands/space-update.js';
import { mockSpaceDetail } from '../helpers/fixtures.js';

// Variant with updated name for update tests
const mockUpdatedSpace = { ...mockSpaceDetail, name: 'Updated Space' };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireApiKey).mockReturnValue('test-api-key');
});

describe('clickup:space.update', () => {
  it('SU-01: updates space — exitCode 0, success message', async () => {
    vi.mocked(updateSpace).mockResolvedValue(mockUpdatedSpace);

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await spaceUpdateCommand.execute(
      ctx,
      mockCLIInput({ argv: ['space-1'], flags: { name: 'Updated Space' } }),
    );

    expect(result.ok).toBe(true);
    expect(captured.success.length).toBeGreaterThan(0);
    expect(captured.success[0]?.message).toContain('Space updated');
    expect(vi.mocked(updateSpace)).toHaveBeenCalledWith('test-api-key', 'space-1', expect.any(Object));
  });

  it('SU-02: --json outputs slim updated space', async () => {
    vi.mocked(updateSpace).mockResolvedValue(mockUpdatedSpace);

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await spaceUpdateCommand.execute(
      ctx,
      mockCLIInput({ argv: ['space-1'], flags: { name: 'Updated Space', json: true } }),
    );

    expect(result.ok).toBe(true);
    expect(captured.json[0]).toMatchObject({ id: 'space-1', name: 'Updated Space' });
    expect(Object.keys(captured.json[0] as object)).toEqual(['id', 'name']);
  });

  it('SU-02b: --json --full outputs raw updated space', async () => {
    vi.mocked(updateSpace).mockResolvedValue(mockUpdatedSpace);

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await spaceUpdateCommand.execute(
      ctx,
      mockCLIInput({ argv: ['space-1'], flags: { name: 'Updated Space', json: true, full: true } }),
    );

    expect(result.ok).toBe(true);
    const raw = captured.json[0] as typeof mockUpdatedSpace;
    expect(raw.folders).toBeDefined();
    expect(raw.statuses).toBeDefined();
  });

  it('SU-03: missing spaceId argv — exitCode 1, error shown', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await spaceUpdateCommand.execute(
      ctx,
      mockCLIInput({ argv: [], flags: { name: 'Updated Space' } }),
    );

    expect(result.ok).toBe(false);
    expect(captured.errors.length).toBeGreaterThan(0);
  });

  it('SU-04: core function throws — exitCode 1, error shown', async () => {
    vi.mocked(updateSpace).mockRejectedValue(new Error('API error'));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await spaceUpdateCommand.execute(
      ctx,
      mockCLIInput({ argv: ['space-1'], flags: { name: 'Updated Space' } }),
    );

    expect(result.ok).toBe(false);
    expect(captured.errors.length).toBeGreaterThan(0);
  });

  it('SU-05: --dry-run shows intent, updateSpace is NOT called', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await spaceUpdateCommand.execute(
      ctx,
      mockCLIInput({ argv: ['space-1'], flags: { name: 'New Name', 'dry-run': true } }),
    );

    expect(result.ok).toBe(true);
    expect(vi.mocked(updateSpace)).not.toHaveBeenCalled();
    expect(captured.infos[0]?.message).toContain('Dry-run');
    expect(captured.infos[0]?.message).toContain('space-1');
  });
});
