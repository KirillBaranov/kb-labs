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

import { requireApiKey, getListStatuses } from '@kb-labs/clickup-core';
import listStatusesCommand from '../../commands/list-statuses.js';
import { mockStatuses } from '../helpers/fixtures.js';

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireApiKey).mockReturnValue('test-api-key');
});

describe('clickup:list.statuses', () => {
  it('LS-01: lists statuses — exitCode 0, table rendered', async () => {
    vi.mocked(getListStatuses).mockResolvedValue(mockStatuses);

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await listStatusesCommand.execute(
      ctx,
      mockCLIInput({ argv: ['list-1'], flags: {} }),
    );

    expect(result.ok).toBe(true);
    expect(captured.table.length).toBeGreaterThan(0);
    expect(vi.mocked(getListStatuses)).toHaveBeenCalledWith('test-api-key', 'list-1');
  });

  it('LS-02: --json outputs slim statuses array', async () => {
    vi.mocked(getListStatuses).mockResolvedValue(mockStatuses);

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await listStatusesCommand.execute(
      ctx,
      mockCLIInput({ argv: ['list-1'], flags: { json: true } }),
    );

    expect(result.ok).toBe(true);
    expect(Array.isArray(captured.json[0])).toBe(true);
    const slim = (captured.json[0] as Array<Record<string, unknown>>)[0];
    expect(slim).toMatchObject({ status: 'open', type: 'open', color: '#000000' });
    expect(slim).not.toHaveProperty('id');
    expect(slim).not.toHaveProperty('orderindex');
  });

  it('LS-02b: --json --full outputs raw statuses array', async () => {
    vi.mocked(getListStatuses).mockResolvedValue(mockStatuses);

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await listStatusesCommand.execute(
      ctx,
      mockCLIInput({ argv: ['list-1'], flags: { json: true, full: true } }),
    );

    expect(result.ok).toBe(true);
    const raw = (captured.json[0] as typeof mockStatuses)[0]!;
    expect(raw.id).toBeDefined();
    expect(raw.orderindex).toBeDefined();
  });

  it('LS-03: missing listId argv — exitCode 1, error shown', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await listStatusesCommand.execute(
      ctx,
      mockCLIInput({ argv: [], flags: {} }),
    );

    expect(result.ok).toBe(false);
    expect(captured.errors.length).toBeGreaterThan(0);
  });

  it('LS-04: core function throws — exitCode 1, error shown', async () => {
    vi.mocked(getListStatuses).mockRejectedValue(new Error('API error'));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await listStatusesCommand.execute(
      ctx,
      mockCLIInput({ argv: ['list-1'], flags: {} }),
    );

    expect(result.ok).toBe(false);
    expect(captured.errors.length).toBeGreaterThan(0);
  });
});
