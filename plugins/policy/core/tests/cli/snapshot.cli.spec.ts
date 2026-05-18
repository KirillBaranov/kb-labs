import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/checks/api-compat-check.js', () => ({
  updateSnapshots: vi.fn(),
}));

vi.mock('@kb-labs/sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@kb-labs/sdk')>();
  return {
    ...actual,
    findRepoRoot: vi.fn().mockResolvedValue('/project'),
  };
});

import { updateSnapshots } from '../../src/checks/api-compat-check.js';
import { createCapturedUI, createMockContext, mockCLIInput } from '@kb-labs/sdk/testing';
import snapshotCommand from '../../src/cli/commands/snapshot.js';

interface SnapshotFlags {
  path?: string;
  'dry-run'?: boolean;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(updateSnapshots).mockReturnValue(undefined);
});

describe('policy:snapshot', () => {
  it('SNAP-01: creates snapshot and prints success', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui, cwd: '/project' });

    const result = await snapshotCommand.execute(ctx as never, mockCLIInput<SnapshotFlags>({ flags: { path: 'platform/kb-labs-sdk' } }));

    expect(result.exitCode).toBe(0);
    expect(updateSnapshots).toHaveBeenCalledWith('platform/kb-labs-sdk', expect.any(String));
    expect(captured.success.length).toBeGreaterThan(0);
  });

  it('SNAP-02: missing --path exits 1 without updating', async () => {
    const { ui } = createCapturedUI();
    const ctx = createMockContext({ ui, cwd: '/project' });

    const result = await snapshotCommand.execute(ctx as never, mockCLIInput<SnapshotFlags>());

    expect(result.exitCode).toBe(1);
    expect(updateSnapshots).not.toHaveBeenCalled();
  });

  it('SNAP-03: --dry-run shows intent, updateSnapshots is NOT called', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui, cwd: '/project' });

    const result = await snapshotCommand.execute(ctx as never, mockCLIInput<SnapshotFlags>({ flags: { path: 'platform/kb-labs-sdk', 'dry-run': true } }));

    expect(result.exitCode).toBe(0);
    expect(updateSnapshots).not.toHaveBeenCalled();
    expect(captured.infos[0]?.message).toContain('Dry-run');
    expect(captured.infos[0]?.message).toContain('platform/kb-labs-sdk');
  });
});
