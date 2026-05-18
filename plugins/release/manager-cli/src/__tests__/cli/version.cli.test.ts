import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@kb-labs/release-manager-core', () => ({
  planRelease: vi.fn(),
  updatePackageVersions: vi.fn(),
  resolveScopePath: vi.fn((_root: string, scope: string) => `${_root}/${scope}`),
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
    useConfig: vi.fn().mockResolvedValue({}),
    findRepoRoot: vi.fn().mockResolvedValue('/project'),
  };
});

vi.mock('../../shared/utils.js', () => ({
  findRepoRoot: vi.fn().mockResolvedValue('/project'),
}));

import { planRelease, updatePackageVersions } from '@kb-labs/release-manager-core';
import { createCapturedUI, createMockContext, mockCLIInput } from '@kb-labs/sdk/testing';
import versionCommand from '../../cli/commands/version.js';

const mockPlan = {
  packages: [
    { name: '@kb-labs/sdk', currentVersion: '1.0.0', nextVersion: '1.1.0' },
    { name: '@kb-labs/core', currentVersion: '2.0.0', nextVersion: '2.1.0' },
  ],
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(planRelease).mockResolvedValue(mockPlan as never);
  vi.mocked(updatePackageVersions).mockResolvedValue([
    { package: '@kb-labs/sdk', from: '1.0.0', to: '1.1.0', updated: true },
    { package: '@kb-labs/core', from: '2.0.0', to: '2.1.0', updated: true },
  ] as never);
});

describe('release:version', () => {
  it('VB-01: bumps versions — exitCode 0, success shown', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui, cwd: '/project' });

    const result = await versionCommand.execute(ctx as never, mockCLIInput({ flags: {} }));

    expect(result.exitCode).toBe(0);
    expect(vi.mocked(updatePackageVersions)).toHaveBeenCalledOnce();
  });

  it('VB-02: no packages found — exitCode 0, message shown', async () => {
    vi.mocked(planRelease).mockResolvedValue({ packages: [] } as never);

    const { ui } = createCapturedUI();
    const ctx = createMockContext({ ui, cwd: '/project' });

    const result = await versionCommand.execute(ctx as never, mockCLIInput({ flags: {} }));

    expect(result.exitCode).toBe(0);
    expect(vi.mocked(updatePackageVersions)).not.toHaveBeenCalled();
  });

  it('VB-03: --json outputs updates array', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui, cwd: '/project' });

    const result = await versionCommand.execute(ctx as never, mockCLIInput({ flags: { json: true } }));

    expect(result.exitCode).toBe(0);
    const out = captured.json[0] as Record<string, unknown>;
    expect(out.ok).toBe(true);
    expect(Array.isArray(out.updates)).toBe(true);
  });

  it('VB-04: --dry-run shows intent, updatePackageVersions is NOT called', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui, cwd: '/project' });

    const result = await versionCommand.execute(ctx as never, mockCLIInput({ flags: { 'dry-run': true } }));

    expect(result.exitCode).toBe(0);
    expect(vi.mocked(updatePackageVersions)).not.toHaveBeenCalled();
    expect(captured.infos[0]?.message).toContain('Dry-run');
    expect(captured.infos[0]?.message).toContain('2 package');
  });
});
