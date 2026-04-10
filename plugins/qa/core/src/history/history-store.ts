import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { PATHS, HISTORY_MAX_ENTRIES } from '@kb-labs/qa-contracts';
import type { HistoryEntry, QAResults, SubmoduleInfo, WorkspacePackage } from '@kb-labs/qa-contracts';

/**
 * Load history entries from disk.
 */
export function loadHistory(rootDir: string): HistoryEntry[] {
  const path = join(rootDir, PATHS.HISTORY);
  if (!existsSync(path)) {return [];}
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return [];
  }
}

/**
 * Save history entries to disk.
 */
export function saveHistory(rootDir: string, entries: HistoryEntry[]): void {
  const path = join(rootDir, PATHS.HISTORY);
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(path, JSON.stringify(entries, null, 2));
}

/**
 * Create a history entry from QA results.
 */
export function createHistoryEntry(
  results: QAResults,
  rootDir: string,
  packages?: WorkspacePackage[],
): HistoryEntry {
  let commit = 'unknown';
  let branch = 'unknown';
  let message = '';

  try {
    commit = execSync('git rev-parse --short HEAD', { cwd: rootDir, encoding: 'utf-8' }).trim();
    branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: rootDir, encoding: 'utf-8' }).trim();
    message = execSync('git log -1 --format=%s', { cwd: rootDir, encoding: 'utf-8' }).trim();
  } catch {
    // git not available
  }

  const hasFailures = Object.values(results).some(r => r.failed.length > 0);

  const summary = {} as HistoryEntry['summary'];
  const failedPackages = {} as HistoryEntry['failedPackages'];

  for (const ct of Object.keys(results)) {
    const r = results[ct]!;
    summary[ct] = {
      passed: r.passed.length,
      failed: r.failed.length,
      skipped: r.skipped.length,
    };
    failedPackages[ct] = [...r.failed];
  }

  // Collect submodule info from packages (deduplicated by repo)
  let submodules: Record<string, SubmoduleInfo> | undefined;
  if (packages) {
    const subs: Record<string, SubmoduleInfo> = {};
    for (const pkg of packages) {
      if (pkg.submodule && !subs[pkg.repo]) {
        subs[pkg.repo] = pkg.submodule;
      }
    }
    if (Object.keys(subs).length > 0) {
      submodules = subs;
    }
  }

  return {
    timestamp: new Date().toISOString(),
    git: { commit, branch, message },
    submodules,
    status: hasFailures ? 'failed' : 'passed',
    summary,
    failedPackages,
  };
}

/**
 * Append a history entry, keeping max HISTORY_MAX_ENTRIES.
 */
export function appendEntry(rootDir: string, entry: HistoryEntry): void {
  const history = loadHistory(rootDir);
  history.push(entry);

  // Trim to max entries
  while (history.length > HISTORY_MAX_ENTRIES) {
    history.shift();
  }

  saveHistory(rootDir, history);
}
