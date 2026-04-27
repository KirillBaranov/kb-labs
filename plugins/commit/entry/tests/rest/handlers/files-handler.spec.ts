/**
 * Tests for files-handler getDiffStats — shell injection safety (H10).
 * Verifies that file paths from git status are passed as args array to execFile,
 * not interpolated into a shell command string.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:child_process', () => ({
  execFile: vi.fn((cmd: string, args: string[], opts: unknown, cb: (err: null, result: { stdout: string }) => void) => {
    cb(null, { stdout: '' });
  }),
}));

// Mock SDK defineHandler to capture execute function
vi.mock('@kb-labs/sdk', () => ({
  defineHandler: (def: { execute: (...args: unknown[]) => unknown }) => def,
  useConfig: vi.fn().mockResolvedValue({}),
}));

vi.mock('@kb-labs/commit-core/analyzer', () => ({
  getGitStatus: vi.fn().mockResolvedValue({ staged: [], unstaged: [], untracked: [] }),
}));

vi.mock('@kb-labs/commit-contracts', () => ({
  COMMIT_CACHE_PREFIX: 'commit:',
  resolveCommitConfig: vi.fn((c: unknown) => ({ scope: { scopes: {} }, ...c as object })),
}));

vi.mock('../../../src/rest/handlers/scope-resolver.js', () => ({
  resolveScopePath: vi.fn().mockReturnValue('/workspace'),
}));

import * as childProcess from 'node:child_process';
import * as analyzer from '@kb-labs/commit-core/analyzer';
import filesHandlerDef from '../../../src/rest/handlers/files-handler.js';

const mockExecFile = vi.mocked(childProcess.execFile);
const mockGetGitStatus = vi.mocked(analyzer.getGitStatus);

function makeCtx() {
  return {
    cwd: '/workspace',
    platform: {
      cache: {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn().mockResolvedValue(undefined),
      },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockExecFile.mockImplementation((_cmd: string, _args: string[], _opts: unknown, cb: unknown) => {
    (cb as (err: null, result: { stdout: string; stderr: string }) => void)(null, { stdout: '', stderr: '' });
  });
  mockGetGitStatus.mockResolvedValue({ staged: [], unstaged: [], untracked: [] });
});

// ─── Shell injection safety ────────────────────────────────────────────────────

describe('files-handler — shell injection safety (H10)', () => {
  it('calls execFile for git diff with args array, not a shell string', async () => {
    mockGetGitStatus.mockResolvedValue({
      staged: ['src/foo.ts'],
      unstaged: [],
      untracked: [],
    });

    await (filesHandlerDef as any).execute(makeCtx(), { query: { scope: 'root' } });

    const gitCall = mockExecFile.mock.calls.find(([cmd]) => cmd === 'git');
    expect(gitCall).toBeTruthy();
    const args = gitCall![1] as string[];
    expect(args).toContain('diff');
    expect(args).toContain('--numstat');
    expect(args).toContain('src/foo.ts');
    // Must be called as args array, not a shell string
    expect(typeof gitCall![1]).not.toBe('string');
  });

  it('passes file with backtick in name as literal arg (no shell execution)', async () => {
    const evilFile = '`id`/malicious.ts';
    mockGetGitStatus.mockResolvedValue({
      staged: [evilFile],
      unstaged: [],
      untracked: [],
    });

    await (filesHandlerDef as any).execute(makeCtx(), { query: { scope: 'root' } });

    const gitCall = mockExecFile.mock.calls.find(([cmd]) => cmd === 'git');
    expect(gitCall).toBeTruthy();
    const args = gitCall![1] as string[];
    // The backtick file is a literal element in the array — shell never sees it
    expect(args).toContain(evilFile);
  });

  it('passes file with $() in name as literal arg (no shell execution)', async () => {
    const evilFile = 'src/$(id).ts';
    mockGetGitStatus.mockResolvedValue({
      staged: [evilFile],
      unstaged: [],
      untracked: [],
    });

    await (filesHandlerDef as any).execute(makeCtx(), { query: { scope: 'root' } });

    const gitCall = mockExecFile.mock.calls.find(([cmd]) => cmd === 'git');
    expect(gitCall).toBeTruthy();
    const args = gitCall![1] as string[];
    expect(args).toContain(evilFile);
  });

  it('calls execFile for wc -l with args array for untracked files', async () => {
    mockGetGitStatus.mockResolvedValue({
      staged: [],
      unstaged: [],
      untracked: ['new-file.ts'],
    });
    // git diff returns empty (untracked not in diff), wc -l called next
    mockExecFile.mockImplementation((cmd: string, _args: string[], _opts: unknown, cb: unknown) => {
      const result = cmd === 'wc' ? { stdout: '42 new-file.ts', stderr: '' } : { stdout: '', stderr: '' };
      (cb as (err: null, result: { stdout: string; stderr: string }) => void)(null, result);
    });

    await (filesHandlerDef as any).execute(makeCtx(), { query: { scope: 'root' } });

    const wcCall = mockExecFile.mock.calls.find(([cmd]) => cmd === 'wc');
    expect(wcCall).toBeTruthy();
    const args = wcCall![1] as string[];
    expect(args).toContain('-l');
    expect(args).toContain('new-file.ts');
    // Args array, not a shell string
    expect(Array.isArray(args)).toBe(true);
  });
});
