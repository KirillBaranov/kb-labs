import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@kb-labs/release-manager-core', () => ({
  planRelease: vi.fn(),
  commitAndTagRelease: vi.fn(),
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

import { planRelease, commitAndTagRelease } from '@kb-labs/release-manager-core';
import { createCapturedUI, createMockContext, mockCLIInput } from '@kb-labs/sdk/testing';
import gitCommand from '../../cli/commands/git.js';

const mockPlan = {
  packages: [
    { name: '@kb-labs/sdk', currentVersion: '1.0.0', nextVersion: '1.1.0' },
    { name: '@kb-labs/core', currentVersion: '2.0.0', nextVersion: '2.1.0' },
  ],
};

const mockGitResult = {
  committed: true,
  tagged: ['@kb-labs/sdk@1.1.0', '@kb-labs/core@2.1.0'],
  pushed: true,
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(planRelease).mockResolvedValue(mockPlan as never);
  vi.mocked(commitAndTagRelease).mockResolvedValue(mockGitResult as never);
});

describe('release:git', () => {
  it('GB-01: commits, tags, pushes — exitCode 0, commitAndTagRelease called', async () => {
    const { ui } = createCapturedUI();
    const ctx = createMockContext({ ui, cwd: '/project' });

    const result = await gitCommand.execute(ctx as never, mockCLIInput({ flags: {} }));

    expect(result.exitCode).toBe(0);
    expect(vi.mocked(commitAndTagRelease)).toHaveBeenCalledOnce();
  });

  it('GB-02: no packages found — exitCode 0, commitAndTagRelease NOT called', async () => {
    vi.mocked(planRelease).mockResolvedValue({ packages: [] } as never);

    const { ui } = createCapturedUI();
    const ctx = createMockContext({ ui, cwd: '/project' });

    const result = await gitCommand.execute(ctx as never, mockCLIInput({ flags: {} }));

    expect(result.exitCode).toBe(0);
    expect(vi.mocked(commitAndTagRelease)).not.toHaveBeenCalled();
  });

  it('GB-03: --json outputs committed/tagged/pushed', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui, cwd: '/project' });

    const result = await gitCommand.execute(ctx as never, mockCLIInput({ flags: { json: true } }));

    expect(result.exitCode).toBe(0);
    const out = captured.json[0] as Record<string, unknown>;
    expect(out.committed).toBe(true);
    expect(Array.isArray(out.tagged)).toBe(true);
  });

  it('GB-04: --dry-run shows intent, commitAndTagRelease is NOT called', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui, cwd: '/project' });

    const result = await gitCommand.execute(ctx as never, mockCLIInput({ flags: { 'dry-run': true } }));

    expect(result.exitCode).toBe(0);
    expect(vi.mocked(commitAndTagRelease)).not.toHaveBeenCalled();
    expect(captured.infos[0]?.message).toContain('Dry-run');
    expect(captured.infos[0]?.message).toContain('2 package');
  });
});
