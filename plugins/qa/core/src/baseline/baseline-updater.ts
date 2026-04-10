import { execSync } from 'node:child_process';
import type { BaselineSnapshot, QAResults } from '@kb-labs/qa-contracts';
import { runQA } from '../runner/qa-orchestrator.js';
import { saveBaseline } from './baseline-store.js';

function getGitInfo(rootDir: string): { commit: string; branch: string } {
  try {
    const commit = execSync('git rev-parse --short HEAD', {
      cwd: rootDir,
      encoding: 'utf-8',
    }).trim();
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: rootDir,
      encoding: 'utf-8',
    }).trim();
    return { commit, branch };
  } catch {
    return { commit: 'unknown', branch: 'unknown' };
  }
}

/**
 * Create a baseline snapshot from QA results.
 */
export function createBaselineFromResults(
  results: QAResults,
  rootDir: string,
): BaselineSnapshot {
  const git = getGitInfo(rootDir);
  const snapshot: BaselineSnapshot = {
    timestamp: new Date().toISOString(),
    git,
    results: {} as BaselineSnapshot['results'],
  };

  for (const ct of Object.keys(results)) {
    const r = results[ct]!;
    snapshot.results[ct] = {
      passed: r.passed.length,
      failed: r.failed.length,
      failedPackages: [...r.failed],
    };
  }

  return snapshot;
}

/**
 * Run full QA and capture baseline.
 */
export async function captureBaseline(rootDir: string): Promise<BaselineSnapshot> {
  const { results } = await runQA({ rootDir });
  const snapshot = createBaselineFromResults(results, rootDir);
  saveBaseline(rootDir, snapshot);
  return snapshot;
}
