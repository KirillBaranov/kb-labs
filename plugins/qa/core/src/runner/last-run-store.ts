import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { PATHS } from '@kb-labs/qa-contracts';
import type { QAResults, WorkspacePackage, SubmoduleInfo } from '@kb-labs/qa-contracts';

/**
 * Stored last-run data: full results + package metadata.
 */
export interface LastRunData {
  timestamp: string;
  results: QAResults;
  packages: WorkspacePackage[];
  submodules?: Record<string, SubmoduleInfo>;
}

/**
 * Save full QA results to disk for the details endpoint.
 */
export function saveLastRun(
  rootDir: string,
  results: QAResults,
  packages: WorkspacePackage[],
  submodules?: Record<string, SubmoduleInfo>,
): void {
  const filePath = join(rootDir, PATHS.LAST_RUN);
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const data: LastRunData = {
    timestamp: new Date().toISOString(),
    results,
    packages: packages.map((p) => ({
      name: p.name,
      dir: p.dir,
      relativePath: p.relativePath,
      repo: p.repo,
      submodule: p.submodule,
    })),
    submodules,
  };

  writeFileSync(filePath, JSON.stringify(data, null, 2));
}

/**
 * Load last-run data from disk.
 */
export function loadLastRun(rootDir: string): LastRunData | null {
  const filePath = join(rootDir, PATHS.LAST_RUN);
  if (!existsSync(filePath)) {return null;}

  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}
