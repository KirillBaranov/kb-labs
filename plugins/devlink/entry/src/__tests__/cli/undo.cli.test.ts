import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@kb-labs/devlink-core', () => ({
  getLastBackup: vi.fn(),
  restoreBackup: vi.fn(),
  saveState: vi.fn(),
  loadState: vi.fn().mockReturnValue({ currentMode: 'npm' }),
}));

vi.mock('@kb-labs/sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@kb-labs/sdk')>();
  return {
    ...actual,
    useLoader: vi.fn(() => ({
      start: vi.fn(),
      stop: vi.fn(),
      succeed: vi.fn(),
      fail: vi.fn(),
    })),
    validationError: vi.fn(),
  };
});

import { getLastBackup, restoreBackup, saveState, loadState } from '@kb-labs/devlink-core';
import { createCapturedUI, createMockContext, mockCLIInput } from '@kb-labs/sdk/testing';
import undoCommand from '../../cli/commands/undo.js';

interface UndoFlags {
  json?: boolean;
  'dry-run'?: boolean;
}

const mockBackup = {
  id: 'backup-abc123',
  timestamp: '2026-01-01T00:00:00Z',
  modeAtBackup: 'local',
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getLastBackup).mockReturnValue(mockBackup as never);
  vi.mocked(restoreBackup).mockReturnValue({ restored: 5, errors: [] } as never);
  vi.mocked(loadState).mockReturnValue({ currentMode: 'npm' } as never);
  vi.mocked(saveState).mockReturnValue(undefined);
});

describe('devlink:undo', () => {
  it('UNDO-01: restores from backup and prints success', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui, cwd: '/project' });

    const result = await undoCommand.execute(ctx as never, mockCLIInput<UndoFlags>());

    expect(result.ok).toBe(true);
    expect(restoreBackup).toHaveBeenCalledOnce();
    expect(captured.success.length).toBeGreaterThan(0);
  });

  it('UNDO-02: no backup exits 1', async () => {
    vi.mocked(getLastBackup).mockReturnValue(null as never);
    const { ui } = createCapturedUI();
    const ctx = createMockContext({ ui, cwd: '/project' });

    const result = await undoCommand.execute(ctx as never, mockCLIInput<UndoFlags>());

    expect(result.ok).toBe(false);
    expect(restoreBackup).not.toHaveBeenCalled();
  });

  it('UNDO-03: --json outputs structured result', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui, cwd: '/project' });

    const result = await undoCommand.execute(ctx as never, mockCLIInput<UndoFlags>({ flags: { json: true } }));

    expect(result.ok).toBe(true);
    expect((captured.json[0] as Record<string, unknown>)?.backupId).toBe('backup-abc123');
  });

  it('UNDO-04: --dry-run shows intent, restoreBackup is NOT called', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui, cwd: '/project' });

    const result = await undoCommand.execute(ctx as never, mockCLIInput<UndoFlags>({ flags: { 'dry-run': true } }));

    expect(result.ok).toBe(true);
    expect(restoreBackup).not.toHaveBeenCalled();
    expect(captured.infos[0]?.message).toContain('Dry-run');
  });
});
