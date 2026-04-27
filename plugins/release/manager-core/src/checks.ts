/**
 * Unified check runner for release manager.
 * Reads config.checks[], supports parser field, script path resolution, perPackage routing.
 */

import { join } from 'node:path';
import type { CustomCheckConfig, CheckResult, CheckResultDetails, PluginLogger } from './types';
import { spawnCommand } from './build';

export interface CheckRunnerOptions {
  repoRoot: string;
  packagePaths: string[];
  scopePath?: string;
  logger?: Pick<PluginLogger, 'info' | 'warn'>;
}

/**
 * Run all configured checks against packages.
 * Handles: parser evaluation, script path resolution, perPackage/scopePath/repoRoot routing.
 */
export async function runReleaseChecks(
  checks: CustomCheckConfig[],
  options: CheckRunnerOptions,
): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  for (const check of checks) {
    const result = await runSingleCheck(check, options);
    results.push(result);

    options.logger?.info?.(`Check ${check.id}: ${result.ok ? 'passed' : 'failed'} (${result.timingMs}ms)`);

    // Stop on first non-optional failure
    if (!result.ok && !check.optional) {
      break;
    }
  }

  return results;
}

async function runSingleCheck(
  check: CustomCheckConfig,
  options: CheckRunnerOptions,
): Promise<CheckResult> {
  const runIn = check.runIn ?? 'perPackage';
  let pathsToRun: string[];

  if (runIn === 'repoRoot') {
    pathsToRun = [options.repoRoot];
  } else if (runIn === 'scopePath') {
    pathsToRun = [options.scopePath ?? options.repoRoot];
  } else {
    pathsToRun = options.packagePaths.length > 0 ? options.packagePaths : [options.repoRoot];
  }

  // Run perPackage checks in parallel (concurrency=8); single-path checks run sequentially.
  const CONCURRENCY = 8;

  const resolvedArgs = (check.args ?? []).map(arg =>
    arg.match(/\.(sh|js|ts|mjs|cjs)$/) ? join(options.repoRoot, arg) : arg
  );
  const fullCommand = [check.command, ...resolvedArgs].join(' ');
  const timeoutMs = check.timeoutMs ?? 120_000;

  type PkgRunResult = { path: string; ok: boolean; details: CheckResultDetails; durationMs: number };

  async function runForPath(pkgPath: string): Promise<PkgRunResult> {
    const result = await spawnCommand(fullCommand, pkgPath, timeoutMs);
    const ok = evaluateParser(check, result.stdout, result.stderr, result.exitCode);
    return {
      path: pkgPath,
      ok,
      durationMs: result.durationMs,
      details: {
        packagePath: pkgPath,
        stdout: result.stdout || undefined,
        stderr: result.stderr || undefined,
        exitCode: result.exitCode,
        error: result.error ?? (!ok ? `exit code ${result.exitCode}` : undefined),
      },
    };
  }

  let pkgResults: PkgRunResult[];

  if (runIn === 'perPackage' && pathsToRun.length > 1) {
    // Parallel with concurrency limit
    pkgResults = [];
    for (let i = 0; i < pathsToRun.length; i += CONCURRENCY) {
      const batch = pathsToRun.slice(i, i + CONCURRENCY);
      pkgResults.push(...await Promise.all(batch.map(runForPath)));
    }
  } else {
    pkgResults = [await runForPath(pathsToRun[0]!)];
  }

  const firstFailure = pkgResults.find(r => !r.ok)?.details;
  const totalDurationMs = pkgResults.reduce((sum, r) => sum + r.durationMs, 0);
  const perPackage: NonNullable<CheckResult['packages']> | undefined = pathsToRun.length > 1
    ? pkgResults.map(r => ({ path: r.path, ok: r.ok, details: r.ok ? undefined : r.details }))
    : undefined;

  const allOk = !firstFailure;

  return {
    id: check.id,
    ok: allOk,
    details: firstFailure,
    hint: check.optional ? 'optional' : undefined,
    timingMs: totalDurationMs,
    packages: perPackage && perPackage.length > 0 ? perPackage : undefined,
  };
}

function evaluateParser(
  check: CustomCheckConfig,
  stdout: string,
  stderr: string,
  exitCode: number,
): boolean {
  const parser = check.parser ?? 'exitcode';

  if (parser === 'exitcode') {
    return exitCode === 0;
  }

  if (parser === 'json') {
    try {
      const parsed = JSON.parse(stdout);
      return parsed.ok === true || parsed.success === true || parsed.status === 'ok';
    } catch {
      return false;
    }
  }

  if (typeof parser === 'function') {
    return parser(stdout, stderr, exitCode);
  }

  return exitCode === 0;
}
