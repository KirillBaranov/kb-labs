import { describe, it, expect, afterEach } from 'vitest';
import { mkdirSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { appendTrendEntry, loadTrendHistory } from '../src/history/trend-store.js';
import type { HistoryEntry } from '@kb-labs/qa-contracts';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTmpRoot(): string {
  const dir = join(tmpdir(), `qa-trend-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function makeEntry(status: 'passed' | 'failed' = 'passed'): HistoryEntry {
  return {
    timestamp: new Date().toISOString(),
    git: { commit: 'abc1234', branch: 'main', message: 'test commit' },
    status,
    summary: { build: { passed: 1, failed: 0, skipped: 0 } },
    failedPackages: {},
  };
}

// ─── loadTrendHistory ─────────────────────────────────────────────────────────

describe('loadTrendHistory', () => {
  it('returns empty array when file does not exist', () => {
    const rootDir = makeTmpRoot();
    expect(loadTrendHistory(rootDir, 'build')).toEqual([]);
  });

  it('returns empty array on corrupt JSON', () => {
    const rootDir = makeTmpRoot();
    mkdirSync(join(rootDir, '.kb/qa/trends'), { recursive: true });
    const { writeFileSync } = require('node:fs');
    writeFileSync(join(rootDir, '.kb/qa/trends/build.json'), 'NOT JSON');
    expect(loadTrendHistory(rootDir, 'build')).toEqual([]);
  });
});

// ─── appendTrendEntry ─────────────────────────────────────────────────────────

describe('appendTrendEntry', () => {
  it('creates file and writes first entry', () => {
    const rootDir = makeTmpRoot();
    appendTrendEntry(rootDir, 'test-coverage', makeEntry());
    expect(existsSync(join(rootDir, '.kb/qa/trends/test-coverage.json'))).toBe(true);
    const entries = loadTrendHistory(rootDir, 'test-coverage');
    expect(entries).toHaveLength(1);
  });

  it('creates parent directory if missing', () => {
    const rootDir = makeTmpRoot();
    expect(existsSync(join(rootDir, '.kb/qa/trends'))).toBe(false);
    appendTrendEntry(rootDir, 'lint', makeEntry());
    expect(existsSync(join(rootDir, '.kb/qa/trends/lint.json'))).toBe(true);
  });

  it('accumulates multiple entries', () => {
    const rootDir = makeTmpRoot();
    appendTrendEntry(rootDir, 'build', makeEntry('passed'));
    appendTrendEntry(rootDir, 'build', makeEntry('failed'));
    appendTrendEntry(rootDir, 'build', makeEntry('passed'));
    const entries = loadTrendHistory(rootDir, 'build');
    expect(entries).toHaveLength(3);
  });

  it('keeps check IDs isolated — different check IDs write to different files', () => {
    const rootDir = makeTmpRoot();
    appendTrendEntry(rootDir, 'build', makeEntry());
    appendTrendEntry(rootDir, 'test-coverage', makeEntry('failed'));
    appendTrendEntry(rootDir, 'test-coverage', makeEntry('failed'));

    expect(loadTrendHistory(rootDir, 'build')).toHaveLength(1);
    expect(loadTrendHistory(rootDir, 'test-coverage')).toHaveLength(2);
  });

  it('trims to max 50 entries', () => {
    const rootDir = makeTmpRoot();
    for (let i = 0; i < 55; i++) {
      appendTrendEntry(rootDir, 'lint', makeEntry());
    }
    const entries = loadTrendHistory(rootDir, 'lint');
    expect(entries).toHaveLength(50);
  });

  it('oldest entry is dropped when over limit', () => {
    const rootDir = makeTmpRoot();
    const firstEntry = { ...makeEntry(), timestamp: '2026-01-01T00:00:00.000Z' };
    appendTrendEntry(rootDir, 'build', firstEntry);
    for (let i = 0; i < 50; i++) {
      appendTrendEntry(rootDir, 'build', makeEntry());
    }
    const entries = loadTrendHistory(rootDir, 'build');
    expect(entries).toHaveLength(50);
    expect(entries[0]!.timestamp).not.toBe('2026-01-01T00:00:00.000Z');
  });

  it('preserves runContext in stored entries', () => {
    const rootDir = makeTmpRoot();
    const entry: HistoryEntry = {
      ...makeEntry(),
      runContext: { taskId: 'task-123', agentId: 'claude' },
    };
    appendTrendEntry(rootDir, 'build', entry);
    const stored = loadTrendHistory(rootDir, 'build');
    expect(stored[0]!.runContext).toEqual({ taskId: 'task-123', agentId: 'claude' });
  });
});
