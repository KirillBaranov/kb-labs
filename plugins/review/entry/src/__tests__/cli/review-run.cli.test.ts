import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockCLIInput, createCapturedUI, createMockContext } from '@kb-labs/shared-testing-e2e/cli';

// Mock SDK hooks before importing the command
vi.mock('@kb-labs/sdk', async (importOriginal) => {
  const original = await importOriginal<typeof import('@kb-labs/sdk')>();
  return {
    ...original,
    useLoader: vi.fn(),
    useConfig: vi.fn(),
  };
});

// Mock review-core functions
vi.mock('@kb-labs/review-core', () => ({
  runReview: vi.fn(),
  resolveGitScope: vi.fn(),
  getReposWithChanges: vi.fn(),
}));

import { useLoader, useConfig } from '@kb-labs/sdk';
import { runReview, resolveGitScope, getReposWithChanges } from '@kb-labs/review-core';
import type { ReviewResult, ScopedFiles } from '@kb-labs/review-core';
import reviewRunCommand from '../../commands/run.js';

const mockedUseLoader = vi.mocked(useLoader);
const mockedUseConfig = vi.mocked(useConfig);
const mockedRunReview = vi.mocked(runReview);
const mockedResolveGitScope = vi.mocked(resolveGitScope);
const mockedGetReposWithChanges = vi.mocked(getReposWithChanges);

/** No-op loader stub that satisfies the useLoader interface */
const noopLoader = {
  start: vi.fn(),
  succeed: vi.fn(),
  fail: vi.fn(),
  update: vi.fn(),
  stop: vi.fn(),
};

/** Minimal ReviewResult with no findings */
function makeReviewResult(findings: Array<{ severity: string; file: string; line: number; message: string }> = []) {
  return {
    findings,
    metadata: {
      analyzedFiles: 3,
      engines: ['heuristic'],
      incremental: null,
    },
  };
}

/** Mock ctx.runtime.fs for file-based scope */
function makeRuntimeMock(files: string[] = []) {
  return {
    fs: {
      glob: vi.fn().mockResolvedValue(files),
      readFile: vi.fn().mockResolvedValue('// file content'),
    },
  } as unknown as ReturnType<typeof createMockContext>['runtime'];
}

beforeEach(() => {
  vi.resetAllMocks();
  mockedUseLoader.mockReturnValue(noopLoader as unknown as ReturnType<typeof useLoader>);
  mockedUseConfig.mockResolvedValue(null);
  // Default: no changed repos → no files → validationError path
  mockedGetReposWithChanges.mockResolvedValue([]);
  mockedResolveGitScope.mockResolvedValue({ files: [] } as unknown as ScopedFiles);
});

describe('review:run', () => {
  it('RR-01: no changed files — exitCode 1 with validation message', async () => {
    // Default mocks: no repos, no files → "no files to review"
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await reviewRunCommand.execute(ctx, mockCLIInput({ flags: {} }));

    expect(result.ok).toBe(false);
    expect(noopLoader.fail).toHaveBeenCalled();
  });

  it('RR-02: changed files found — runs review, exitCode 0 when no blockers', async () => {
    mockedGetReposWithChanges.mockResolvedValue(['packages/core']);
    mockedResolveGitScope.mockResolvedValue({
      files: [{ path: 'packages/core/src/index.ts', content: 'export {}' }],
    } as unknown as ScopedFiles);
    mockedRunReview.mockResolvedValue(makeReviewResult() as unknown as ReviewResult);

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await reviewRunCommand.execute(ctx, mockCLIInput({ flags: {} }));

    expect(result.ok).toBe(true);
    expect(mockedRunReview).toHaveBeenCalledOnce();
    expect(captured.success.length + captured.warnings.length).toBeGreaterThan(0);
  });

  it('RR-03: blocker finding — exitCode 1', async () => {
    mockedGetReposWithChanges.mockResolvedValue(['packages/core']);
    mockedResolveGitScope.mockResolvedValue({
      files: [{ path: 'src/index.ts', content: 'eval("x")' }],
    } as unknown as ScopedFiles);
    mockedRunReview.mockResolvedValue(makeReviewResult([
      { severity: 'blocker', file: 'src/index.ts', line: 1, message: 'eval is dangerous' },
    ]) as unknown as ReviewResult);

    const { ui } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await reviewRunCommand.execute(ctx, mockCLIInput({ flags: {} }));

    expect(result.ok).toBe(false);
    expect(result.result?.passed).toBe(false);
  });

  it('RR-04: --json flag — outputs ReviewResult via ctx.ui.json', async () => {
    mockedGetReposWithChanges.mockResolvedValue(['packages/core']);
    mockedResolveGitScope.mockResolvedValue({
      files: [{ path: 'src/a.ts', content: '' }],
    } as unknown as ScopedFiles);
    const reviewResult = makeReviewResult();
    mockedRunReview.mockResolvedValue(reviewResult as unknown as ReviewResult);

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    await reviewRunCommand.execute(ctx, mockCLIInput({ flags: { json: true } }));

    expect(captured.json.length).toBeGreaterThan(0);
    expect(captured.json[0]).toMatchObject({ findings: [], metadata: { analyzedFiles: 3 } });
  });

  it('RR-05: --scope=staged uses includeStaged filter', async () => {
    mockedGetReposWithChanges.mockResolvedValue(['packages/core']);
    mockedResolveGitScope.mockResolvedValue({ files: [{ path: 'a.ts', content: '' }] } as unknown as ScopedFiles);
    mockedRunReview.mockResolvedValue(makeReviewResult() as unknown as ReviewResult);

    const { ui } = createCapturedUI();
    const ctx = createMockContext({ ui });
    await reviewRunCommand.execute(ctx, mockCLIInput({ flags: { scope: 'staged' } }));

    expect(mockedResolveGitScope).toHaveBeenCalledWith(
      expect.objectContaining({ includeStaged: true, includeUnstaged: false }),
    );
  });

  it('RR-06: --repos flag skips getReposWithChanges, uses resolveGitScope directly', async () => {
    mockedResolveGitScope.mockResolvedValue({ files: [{ path: 'b.ts', content: '' }] } as unknown as ScopedFiles);
    mockedRunReview.mockResolvedValue(makeReviewResult() as unknown as ReviewResult);

    const { ui } = createCapturedUI();
    const ctx = createMockContext({ ui });
    await reviewRunCommand.execute(ctx, mockCLIInput({ flags: { repos: ['packages/ui'] } }));

    expect(mockedGetReposWithChanges).not.toHaveBeenCalled();
    expect(mockedResolveGitScope).toHaveBeenCalledWith(
      expect.objectContaining({ repos: ['packages/ui'] }),
    );
  });

  it('RR-07: runReview throws — exitCode 1, loader.fail called', async () => {
    mockedGetReposWithChanges.mockResolvedValue(['packages/core']);
    mockedResolveGitScope.mockResolvedValue({ files: [{ path: 'c.ts', content: '' }] } as unknown as ScopedFiles);
    mockedRunReview.mockRejectedValue(new Error('LLM timeout'));

    const { ui } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await reviewRunCommand.execute(ctx, mockCLIInput({ flags: {} }));

    expect(result.ok).toBe(false);
    expect(noopLoader.fail).toHaveBeenCalled();
  });

  it('RR-08: --files flag reads specific files via ctx.runtime.fs.glob', async () => {
    mockedRunReview.mockResolvedValue(makeReviewResult() as unknown as ReviewResult);

    const { ui } = createCapturedUI();
    const ctx = createMockContext({ ui });
    // Inject runtime mock with glob
    const runtime = makeRuntimeMock(['src/target.ts']);
    (ctx as { runtime: typeof runtime }).runtime = runtime;

    await reviewRunCommand.execute(ctx, mockCLIInput({ flags: { files: ['src/*.ts'] } }));

    expect(runtime.fs.glob).toHaveBeenCalled();
    expect(mockedRunReview).toHaveBeenCalledWith(
      expect.objectContaining({ files: expect.any(Array) }),
    );
  });
});
