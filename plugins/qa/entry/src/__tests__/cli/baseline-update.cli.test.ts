import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@kb-labs/qa-core', () => ({
  DevkitAdapter: vi.fn().mockImplementation(() => ({
    check: vi.fn().mockResolvedValue({ passed: 10, failed: 0, skipped: 0 }),
    stats: vi.fn().mockResolvedValue({ coverage: 85, duration: 1200 }),
  })),
  SnapshotStore: vi.fn().mockImplementation(() => ({
    saveBaseline: vi.fn().mockReturnValue({ id: 'baseline-1', createdAt: '2026-01-01' }),
  })),
  resolveDevkitBin: vi.fn().mockReturnValue('/usr/local/bin/kb-devkit'),
  captureGit: vi.fn().mockResolvedValue({ commit: 'abc123', branch: 'main', message: 'test' }),
  buildBaselineReport: vi.fn().mockReturnValue([{ header: 'Results', lines: ['✓ Baseline saved'] }]),
}));

vi.mock('@kb-labs/sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@kb-labs/sdk')>();
  return {
    ...actual,
    useConfig: vi.fn().mockResolvedValue(null),
  };
});

import { DevkitAdapter, SnapshotStore, resolveDevkitBin, captureGit, buildBaselineReport } from '@kb-labs/qa-core';
import { createCapturedUI, createMockContext, mockCLIInput } from '@kb-labs/sdk/testing';
import baselineUpdateCommand from '../../cli/commands/baseline-update.js';

interface BaselineUpdateFlags {
  json?: boolean;
  'dry-run'?: boolean;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(resolveDevkitBin).mockReturnValue('/usr/local/bin/kb-devkit');
  vi.mocked(captureGit).mockResolvedValue({ commit: 'abc123', branch: 'main', message: 'test' } as never);
  vi.mocked(buildBaselineReport).mockReturnValue([{ header: 'Results', lines: ['✓ Baseline saved'] }]);
  vi.mocked(DevkitAdapter).mockImplementation(() => ({
    check: vi.fn().mockResolvedValue({ passed: 10, failed: 0, skipped: 0 }),
    stats: vi.fn().mockResolvedValue({ coverage: 85, duration: 1200 }),
  }) as never);
  vi.mocked(SnapshotStore).mockImplementation(() => ({
    saveBaseline: vi.fn().mockReturnValue({ id: 'baseline-1', createdAt: '2026-01-01' }),
  }) as never);
});

describe('qa:baseline:update', () => {
  it('QBU-01: runs check+stats and saves baseline', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui, cwd: '/project' });

    const result = await baselineUpdateCommand.execute(ctx as never, mockCLIInput<BaselineUpdateFlags>());

    expect(result.exitCode).toBe(0);
    expect(SnapshotStore).toHaveBeenCalledOnce();
    expect(captured.success.length).toBeGreaterThan(0);
  });

  it('QBU-02: --json outputs baseline data', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui, cwd: '/project' });

    const result = await baselineUpdateCommand.execute(ctx as never, mockCLIInput<BaselineUpdateFlags>({ flags: { json: true } }));

    expect(result.exitCode).toBe(0);
    expect(captured.json.length).toBeGreaterThan(0);
  });

  it('QBU-03: --dry-run shows intent, no checks run', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui, cwd: '/project' });

    const result = await baselineUpdateCommand.execute(ctx as never, mockCLIInput<BaselineUpdateFlags>({ flags: { 'dry-run': true } }));

    expect(result.exitCode).toBe(0);
    expect(DevkitAdapter).not.toHaveBeenCalled();
    expect(SnapshotStore).not.toHaveBeenCalled();
    expect(captured.infos[0]?.message).toContain('Dry-run');
  });
});
