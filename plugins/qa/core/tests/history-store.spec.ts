import { describe, it, expect } from 'vitest';
import { mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { createHistoryEntry, appendEntry, loadHistory } from '../src/history/history-store.js';
import { loadTrendHistory } from '../src/history/trend-store.js';
import type { QAResults, QACheckConfig } from '@kb-labs/qa-contracts';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTmpRoot(): string {
  const dir = join(tmpdir(), `qa-history-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Creates a minimal git repo so createHistoryEntry can read git info. */
function makeGitRoot(): string {
  const dir = makeTmpRoot();
  execSync('git init', { cwd: dir, stdio: 'ignore' });
  execSync('git config user.email "test@test.com"', { cwd: dir, stdio: 'ignore' });
  execSync('git config user.name "Test"', { cwd: dir, stdio: 'ignore' });
  execSync('git commit --allow-empty -m "init"', { cwd: dir, stdio: 'ignore' });
  return dir;
}

const passedResults: QAResults = {
  build: { passed: ['pkg-a'], failed: [], skipped: [], errors: {} },
};

const failedResults: QAResults = {
  build: { passed: [], failed: ['pkg-a'], skipped: [], errors: { 'pkg-a': 'build error' } },
};

// ─── createHistoryEntry ───────────────────────────────────────────────────────

describe('createHistoryEntry', () => {
  it('creates entry with passed status', () => {
    const rootDir = makeGitRoot();
    const entry = createHistoryEntry(passedResults, rootDir);
    expect(entry.status).toBe('passed');
    expect(entry.summary['build']?.passed).toBe(1);
    expect(entry.summary['build']?.failed).toBe(0);
  });

  it('creates entry with failed status', () => {
    const rootDir = makeGitRoot();
    const entry = createHistoryEntry(failedResults, rootDir);
    expect(entry.status).toBe('failed');
    expect(entry.failedPackages['build']).toContain('pkg-a');
  });

  it('attaches runContext when provided', () => {
    const rootDir = makeGitRoot();
    const ctx = { taskId: 'task-123', agentId: 'claude', workflowRunId: 'wf-456' };
    const entry = createHistoryEntry(passedResults, rootDir, undefined, ctx);
    expect(entry.runContext).toEqual(ctx);
  });

  it('no runContext field when not provided', () => {
    const rootDir = makeGitRoot();
    const entry = createHistoryEntry(passedResults, rootDir);
    expect(entry.runContext).toBeUndefined();
  });

  it('handles non-git directory gracefully', () => {
    const rootDir = makeTmpRoot(); // no git init
    const entry = createHistoryEntry(passedResults, rootDir);
    expect(entry.git.commit).toBe('unknown');
    expect(entry.git.branch).toBe('unknown');
    expect(entry.status).toBe('passed');
  });

  it('includes timestamp as ISO string', () => {
    const rootDir = makeGitRoot();
    const entry = createHistoryEntry(passedResults, rootDir);
    expect(() => new Date(entry.timestamp)).not.toThrow();
    expect(new Date(entry.timestamp).toISOString()).toBe(entry.timestamp);
  });

  it('reads git commit and branch', () => {
    const rootDir = makeGitRoot();
    const entry = createHistoryEntry(passedResults, rootDir);
    expect(entry.git.commit).not.toBe('unknown');
    expect(entry.git.branch).not.toBe('unknown');
  });
});

// ─── appendEntry ─────────────────────────────────────────────────────────────

describe('appendEntry', () => {
  it('creates history.json on first write', () => {
    const rootDir = makeGitRoot();
    const entry = createHistoryEntry(passedResults, rootDir);
    appendEntry(rootDir, entry);
    expect(existsSync(join(rootDir, '.kb/qa/history.json'))).toBe(true);
  });

  it('accumulates entries', () => {
    const rootDir = makeGitRoot();
    for (let i = 0; i < 3; i++) {
      appendEntry(rootDir, createHistoryEntry(passedResults, rootDir));
    }
    const history = loadHistory(rootDir);
    expect(history).toHaveLength(3);
  });

  it('trims to max 50 entries', () => {
    const rootDir = makeGitRoot();
    const entry = createHistoryEntry(passedResults, rootDir);
    for (let i = 0; i < 55; i++) {
      appendEntry(rootDir, entry);
    }
    const history = loadHistory(rootDir);
    expect(history).toHaveLength(50);
  });

  it('does NOT write trend file when trending is false', () => {
    const rootDir = makeGitRoot();
    const checks: QACheckConfig[] = [{ id: 'build', command: 'x', trending: false }];
    appendEntry(rootDir, createHistoryEntry(passedResults, rootDir), checks);
    expect(existsSync(join(rootDir, '.kb/qa/trends/build.json'))).toBe(false);
  });

  it('writes trend file when trending is true', () => {
    const rootDir = makeGitRoot();
    const checks: QACheckConfig[] = [{ id: 'build', command: 'x', trending: true }];
    appendEntry(rootDir, createHistoryEntry(passedResults, rootDir), checks);
    expect(existsSync(join(rootDir, '.kb/qa/trends/build.json'))).toBe(true);
  });

  it('trend file contains the entry', () => {
    const rootDir = makeGitRoot();
    const checks: QACheckConfig[] = [{ id: 'build', command: 'x', trending: true }];
    appendEntry(rootDir, createHistoryEntry(passedResults, rootDir), checks);
    const trend = loadTrendHistory(rootDir, 'build');
    expect(trend).toHaveLength(1);
    expect(trend[0]!.status).toBe('passed');
  });

  it('does NOT write trend file for check not present in results', () => {
    const rootDir = makeGitRoot();
    // test-coverage not in passedResults (which only has 'build')
    const checks: QACheckConfig[] = [{ id: 'test-coverage', command: 'x', trending: true }];
    appendEntry(rootDir, createHistoryEntry(passedResults, rootDir), checks);
    expect(existsSync(join(rootDir, '.kb/qa/trends/test-coverage.json'))).toBe(false);
  });

  it('runContext is persisted to history.json', () => {
    const rootDir = makeGitRoot();
    const ctx = { taskId: 'task-xyz', sessionId: 'sess-1' };
    const entry = createHistoryEntry(passedResults, rootDir, undefined, ctx);
    appendEntry(rootDir, entry);
    const history = loadHistory(rootDir);
    expect(history[0]!.runContext).toEqual(ctx);
  });
});
