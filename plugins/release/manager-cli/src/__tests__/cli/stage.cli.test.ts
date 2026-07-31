import { describe, it, expect, vi, beforeEach } from 'vitest';

// Reproduces the "cross-flow dependency ships as literal workspace:*" bug:
// stage.ts built its versionMap only from the current flow's own packages
// (`discovered`), so a dependency owned by a DIFFERENT flow (e.g. sdk's
// dependency on @kb-labs/core-retry, which is platform-flow-scoped) was
// invisible to rewriteWorkspaceDeps. rewriteWorkspaceDeps silently skips any
// dep with no entry in versionMap, and `npm pack` — unlike `pnpm pack` —
// never resolves workspace:* on its own, so the literal string shipped to
// the published tarball on npm.

vi.mock('@kb-labs/release-manager-core', () => ({
  discoverCurrentPackages: vi.fn(),
  mergeConfigWithFlow: vi.fn((config: unknown, flow: string) => ({ ...(config as object), __flow: flow })),
  verifyExtractedTarball: vi.fn(() => []),
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
  };
});

vi.mock('../../shared/utils.js', () => ({
  findRepoRoot: vi.fn().mockResolvedValue('/project'),
}));

vi.mock('../../shared/dep-rewrite.js', () => ({
  rewriteWorkspaceDeps: vi.fn(() => () => {}),
}));

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn((cmd: string) => {
    if (cmd === 'npm') {
      return { status: 0, stdout: JSON.stringify([{ filename: 'kb-labs-sdk-2.115.0.tgz' }]), stderr: '' };
    }
    return { status: 0, stdout: '', stderr: '' }; // tar extract
  }),
}));

vi.mock('node:fs', () => ({
  mkdirSync: vi.fn(),
  mkdtempSync: vi.fn(() => '/tmp/kb-stage-verify'),
  readFileSync: vi.fn(() => Buffer.from('fake-tarball-bytes')),
  rmSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

import { discoverCurrentPackages } from '@kb-labs/release-manager-core';
import { createCapturedUI, createMockContext, mockCLIInput } from '@kb-labs/sdk/testing';
import { rewriteWorkspaceDeps } from '../../shared/dep-rewrite.js';
import stageCommand from '../../cli/commands/stage.js';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(rewriteWorkspaceDeps).mockReturnValue(() => {});

  vi.mocked(discoverCurrentPackages).mockImplementation(async (_cwd, _scope, config) => {
    const isFlowScoped = (config as { __flow?: string }).__flow !== undefined;
    if (isFlowScoped) {
      // Only sdk's own flow package — its dependency on core-retry (owned by
      // the `platform` flow) is deliberately NOT in this list.
      return [
        { name: '@kb-labs/sdk', currentVersion: '2.115.0', nextVersion: '2.115.0', path: '/project/sdk/sdk', gitRoot: '/project', bump: 'auto', isPublished: false },
      ] as never;
    }
    // Whole-workspace discovery (no flow scoping) — includes the cross-flow dep.
    return [
      { name: '@kb-labs/sdk', currentVersion: '2.115.0', nextVersion: '2.115.0', path: '/project/sdk/sdk', gitRoot: '/project', bump: 'auto', isPublished: false },
      { name: '@kb-labs/core-retry', currentVersion: '2.114.0', nextVersion: '2.114.0', path: '/project/core/retry', gitRoot: '/project', bump: 'auto', isPublished: false },
    ] as never;
  });
});

describe('release:stage — cross-flow dependency versions', () => {
  it('includes a dependency owned by a different flow in the versionMap passed to rewriteWorkspaceDeps', async () => {
    const { ui } = createCapturedUI();
    const ctx = createMockContext({ ui, cwd: '/project' });

    const result = await stageCommand.execute(ctx as never, mockCLIInput({ flags: { flow: 'sdk' } }));

    expect(result.ok).toBe(true);
    expect(vi.mocked(rewriteWorkspaceDeps)).toHaveBeenCalledOnce();

    const versionMap = vi.mocked(rewriteWorkspaceDeps).mock.calls[0]![1] as Map<string, string>;
    // The bug: versionMap built only from `discovered` (flow-scoped) never had
    // this entry, so rewriteWorkspaceDeps silently left "workspace:*" as-is.
    expect(versionMap.get('@kb-labs/core-retry')).toBe('2.114.0');
    expect(versionMap.get('@kb-labs/sdk')).toBe('2.115.0');
  });

  it('still only packs the flow-scoped packages, not the whole workspace', async () => {
    const { ui } = createCapturedUI();
    const ctx = createMockContext({ ui, cwd: '/project' });

    await stageCommand.execute(ctx as never, mockCLIInput({ flags: { flow: 'sdk' } }));

    // rewriteWorkspaceDeps (and therefore packing) runs once — for sdk only,
    // core-retry is a version-resolution source, not something this flow stages.
    expect(vi.mocked(rewriteWorkspaceDeps)).toHaveBeenCalledTimes(1);
    const pkgArg = vi.mocked(rewriteWorkspaceDeps).mock.calls[0]![0] as { path: string; version: string };
    expect(pkgArg.path).toBe('/project/sdk/sdk');
  });
});
