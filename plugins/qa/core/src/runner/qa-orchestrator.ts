import type { QARunOptions, QAResults, QARunResult, SubmoduleInfo, WorkspacePackage } from '@kb-labs/qa-contracts';
import { getWorkspacePackages } from './workspace.js';
import { runCustomChecks } from './custom-check-runner.js';
import { loadCache, saveCache, updateCacheEntry } from './cache.js';
import { runBuildCheck } from './build-runner.js';
import { runLintCheck } from './lint-runner.js';
import { runTypeCheck } from './type-runner.js';
import { runTestCheck } from './test-runner.js';
import { saveLastRun } from './last-run-store.js';

const SKIP_ALIASES: Record<string, string> = {
  types: 'typecheck',
  'type-check': 'typecheck',
  tests: 'test',
};

function runBuiltinChecks(
  options: QARunOptions,
  packages: WorkspacePackage[],
  skipSet: Set<string>,
  results: QAResults,
): void {
  const { rootDir, noCache } = options;
  if (!skipSet.has('build')) {
    results.build = runBuildCheck({
      rootDir, packages, noCache,
      onProgress: (pkg, status, durationMs) => options.onProgress?.('build', pkg, status, durationMs),
    });
  }
  if (!skipSet.has('lint')) {
    results.lint = runLintCheck({
      rootDir, packages,
      onProgress: (pkg, status, durationMs) => options.onProgress?.('lint', pkg, status, durationMs),
    });
  }
  if (!skipSet.has('typecheck')) {
    results.typeCheck = runTypeCheck({
      rootDir, packages,
      onProgress: (pkg, status, durationMs) => options.onProgress?.('typeCheck', pkg, status, durationMs),
    });
  }
  if (!skipSet.has('test')) {
    results.test = runTestCheck({
      rootDir, packages,
      onProgress: (pkg, status, durationMs) => options.onProgress?.('test', pkg, status, durationMs),
    });
  }
}

/**
 * Run all QA checks in order: build → lint → typeCheck → test.
 * Respects skip flags and package filters.
 * If options.checks is provided, uses custom check runners instead of built-ins.
 */
export async function runQA(options: QARunOptions): Promise<QARunResult> {
  const { rootDir, noCache } = options;

  const skipSet = new Set(
    (options.skipChecks ?? []).map(s => SKIP_ALIASES[s.toLowerCase()] ?? s.toLowerCase()),
  );

  const filter = { package: options.package, repo: options.repo, scope: options.scope };
  const packages = getWorkspacePackages(rootDir, filter, options.packagesConfig);
  let cache = noCache ? {} : loadCache(rootDir);

  const results: QAResults = {};

  if (options.checks && options.checks.length > 0) {
    const activeChecks = skipSet.size > 0
      ? options.checks.filter(c => !skipSet.has(c.id.toLowerCase()))
      : options.checks;
    Object.assign(results, runCustomChecks(activeChecks, packages, rootDir,
      (checkId, pkg, status, durationMs) => { options.onProgress?.(checkId, pkg, status, durationMs); },
    ));
  } else {
    runBuiltinChecks(options, packages, skipSet, results);
  }

  if (!noCache) {
    for (const pkg of packages) {
      cache = updateCacheEntry(pkg.dir, pkg.name, cache);
    }
    saveCache(rootDir, cache);
  }

  const submodules: Record<string, SubmoduleInfo> = {};
  for (const pkg of packages) {
    if (pkg.submodule && !submodules[pkg.repo]) {
      submodules[pkg.repo] = pkg.submodule;
    }
  }
  saveLastRun(rootDir, results, packages, Object.keys(submodules).length > 0 ? submodules : undefined);

  return { results, packages };
}
