import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@kb-labs/release-manager-core', () => ({
  planRelease: vi.fn(),
  runReleaseChecks: vi.fn(),
  resolveScopePath: vi.fn((root: string, scope: string) => `${root}/${scope}`),
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
    useConfig: vi.fn().mockResolvedValue({ checks: [{ id: 'placeholder', command: 'true' }] }),
    findRepoRoot: vi.fn().mockResolvedValue('/project'),
  };
});

vi.mock('../../shared/utils.js', () => ({
  findRepoRoot: vi.fn().mockResolvedValue('/project'),
}));

import { planRelease, runReleaseChecks } from '@kb-labs/release-manager-core';
import { useConfig } from '@kb-labs/sdk';
import { createCapturedUI, createMockContext, mockCLIInput } from '@kb-labs/sdk/testing';
import checksCommand from '../../cli/commands/checks.js';

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(planRelease).mockResolvedValue({ packages: [] } as never);
  vi.mocked(useConfig).mockResolvedValue({ checks: [{ id: 'placeholder', command: 'true' }] } as never);
});

describe('release:checks', () => {
  it('CB-01: all required checks pass — ok:true', async () => {
    vi.mocked(runReleaseChecks).mockResolvedValue([
      { id: 'dist-exports', ok: true, timingMs: 10 },
    ] as never);

    const { ui } = createCapturedUI();
    const ctx = createMockContext({ ui, cwd: '/project' });

    const result = await checksCommand.execute(ctx as never, mockCLIInput({ flags: { json: true } }));

    expect(result.ok).toBe(true);
  });

  it('CB-02 (regression): a failed optional check must not fail the overall run — ' +
    'ok computation used to be results.every(r => r.ok), ignoring r.optional entirely, ' +
    'so marking a broken check "optional" in config had no effect on the CLI exit code', async () => {
    vi.mocked(runReleaseChecks).mockResolvedValue([
      { id: 'dist-exports', ok: true, timingMs: 10 },
      { id: 'pack-install', ok: false, optional: true, details: { error: 'boom' }, timingMs: 5 },
    ] as never);

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui, cwd: '/project' });

    const result = await checksCommand.execute(ctx as never, mockCLIInput({ flags: { json: true } }));

    expect(result.ok).toBe(true);
    const out = captured.json[0] as Record<string, unknown>;
    expect(out.ok).toBe(true);
    expect(out.failed).toEqual(['pack-install']);
  });

  it('CB-03: a failed required (non-optional) check still fails the overall run', async () => {
    vi.mocked(runReleaseChecks).mockResolvedValue([
      { id: 'dist-exports', ok: false, details: { error: 'boom' }, timingMs: 5 },
    ] as never);

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui, cwd: '/project' });

    const result = await checksCommand.execute(ctx as never, mockCLIInput({ flags: { json: true } }));

    expect(result.ok).toBe(false);
    const out = captured.json[0] as Record<string, unknown>;
    expect(out.ok).toBe(false);
    expect(out.failed).toEqual(['dist-exports']);
  });

  it('CB-04: --flow selects flow checks instead of the global check list', async () => {
    vi.mocked(useConfig).mockResolvedValue({
      checks: [{ id: 'global-typecheck', command: 'pnpm', args: ['type-check'] }],
      flows: {
        platform: {
          checks: [{ id: 'dist-exports', command: 'bash', args: ['scripts/gates/check-dist-exports.sh'] }],
        },
      },
    } as never);
    vi.mocked(runReleaseChecks).mockResolvedValue([
      { id: 'dist-exports', ok: true, timingMs: 10 },
    ] as never);

    const { ui } = createCapturedUI();
    const ctx = createMockContext({ ui, cwd: '/project' });

    const result = await checksCommand.execute(ctx as never, mockCLIInput({ flags: { json: true, flow: 'platform' } }));

    expect(result.ok).toBe(true);
    expect(vi.mocked(runReleaseChecks).mock.calls[0]?.[0]).toEqual([
      { id: 'dist-exports', command: 'bash', args: ['scripts/gates/check-dist-exports.sh'] },
    ]);
  });
});
