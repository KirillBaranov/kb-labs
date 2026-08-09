/**
 * Unified check runner for release manager.
 * Reads config.checks[], supports parser field, script path resolution, perPackage routing.
 */

import { join } from 'node:path';
import type { CustomCheckConfig, CheckResult, CheckResultDetails, PluginLogger, ReleaseShell } from './types';

export interface CheckRunnerOptions {
  repoRoot: string;
  packagePaths: string[];
  scopePath?: string;
  logger?: Pick<PluginLogger, 'info' | 'warn'>;
  shell: ReleaseShell;
}

/**
 * Max parallel shell.exec calls for perPackage checks.
 * Must match the plugin manifest's `shell.maxConcurrent` permission
 * (plugins/release/manager-cli/src/manifest.ts) — the platform's process
 * broker admits at most that many concurrent shells for this plugin, so
 * batching above it just queues and can blow the per-check timeout.
 *
 * Kept low (not e.g. 8) because pack-install is not a cheap script: it packs
 * the tarball and runs a real `npm install` of it into a throwaway consumer
 * per package. At higher concurrency those installs contend for CPU/disk/npm
 * registry and start blowing their own per-check timeout under load.
 */
export const CHECKS_CONCURRENCY = 2;

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

  // Run perPackage checks in parallel, bounded by the plugin's granted shell concurrency;
  // single-path checks run sequentially.
  const resolvedArgs = (check.args ?? []).map(arg =>
    arg.match(/\.(sh|js|ts|mjs|cjs)$/) ? join(options.repoRoot, arg) : arg
  );
  const timeoutMs = check.timeoutMs ?? 120_000;

  type PkgRunResult = { path: string; ok: boolean; details: CheckResultDetails; durationMs: number };

  async function runForPath(pkgPath: string): Promise<PkgRunResult> {
    const startedAt = Date.now();
    const result = await options.shell.exec(check.command, resolvedArgs, { cwd: pkgPath, timeout: timeoutMs });
    const ok = evaluateParser(check, result.stdout, result.stderr, result.code);
    return {
      path: pkgPath,
      ok,
      durationMs: Date.now() - startedAt,
      details: {
        packagePath: pkgPath,
        stdout: result.stdout || undefined,
        stderr: result.stderr || undefined,
        exitCode: result.code,
        error: !ok ? `exit code ${result.code}` : undefined,
      },
    };
  }

  let pkgResults: PkgRunResult[];

  if (runIn === 'perPackage' && pathsToRun.length > 1) {
    // Parallel with concurrency limit
    pkgResults = [];
    for (let i = 0; i < pathsToRun.length; i += CHECKS_CONCURRENCY) {
      const batch = pathsToRun.slice(i, i + CHECKS_CONCURRENCY);
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
    optional: check.optional,
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
