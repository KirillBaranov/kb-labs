/**
 * Unified check runner for release manager.
 * Reads config.checks[], supports parser field, script path resolution, perPackage routing.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CustomCheckConfig, CheckResult, CheckResultDetails, PluginLogger, ReleaseShell } from './types';
import { matchesPackagePattern } from './planner';

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
 *
 * Overridable via KB_RELEASE_CHECKS_CONCURRENCY for profiling/tuning without
 * a source edit + rebuild; the default (2) is unchanged when unset.
 */
export const CHECKS_CONCURRENCY = Number(process.env.KB_RELEASE_CHECKS_CONCURRENCY) || 2;

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

  if (runIn === 'perPackage' && check.skipPackages?.length) {
    const skipPatterns = check.skipPackages;
    pathsToRun = pathsToRun.filter(pkgPath => {
      const name = readPackageName(pkgPath);
      const skip = name != null && matchesPackagePattern(name, pkgPath, skipPatterns);
      if (skip) {
        options.logger?.info?.(`Check ${check.id}: skipping ${name} (matches skipPackages)`);
      }
      return !skip;
    });
  }

  // Run perPackage checks in parallel, bounded by the plugin's granted shell concurrency;
  // single-path checks run sequentially.
  const resolvedArgs = (check.args ?? []).map(arg =>
    arg.match(/\.(sh|js|ts|mjs|cjs)$/) ? join(options.repoRoot, arg) : arg
  );
  const timeoutMs = check.timeoutMs ?? 120_000;

  type PkgRunResult = { path: string; ok: boolean; details: CheckResultDetails; durationMs: number };

  async function runForPath(pkgPath: string, attempt = 1): Promise<PkgRunResult> {
    const startedAt = Date.now();
    try {
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
    } catch (error) {
      // A governor-enforced timeout kill (ExecOptions.retry does not cover
      // this: the process backend only retries PROCESS_SPAWN_FAILED, never
      // a timeout — see core/plugin-runtime/src/process/node-backend.ts) is
      // a rejection, not a resolved non-zero exit. It's plausibly transient
      // concurrency contention (see CHECKS_CONCURRENCY doc above), so retry
      // once. Any other rejection is a real failure and is not retried.
      if (attempt === 1 && isTimeoutError(error)) {
        const partial = partialResultOf(error);
        options.logger?.warn?.(
          `Check ${check.id}: ${pkgPath} timed out, retrying once` +
          (partial?.stdout || partial?.stderr
            ? ` (captured ${partial.stdout?.length ?? 0}B stdout / ${partial.stderr?.length ?? 0}B stderr before kill)`
            : ''),
        );
        return runForPath(pkgPath, attempt + 1);
      }
      // GovernedProcessError (node-backend.ts) attaches whatever stdout/stderr
      // the killed process had buffered up to the moment of the kill as
      // details.result — without pulling that through, a second-attempt
      // timeout (or any other terminationReason) surfaces only the generic
      // "Process terminated: timeout" message, identical to what an agent
      // debugging this dead-blind sees today. See node-backend.ts finish().
      const partial = partialResultOf(error);
      return {
        path: pkgPath,
        ok: false,
        durationMs: Date.now() - startedAt,
        details: {
          packagePath: pkgPath,
          stdout: partial?.stdout || undefined,
          stderr: partial?.stderr || undefined,
          exitCode: partial?.exitCode,
          error: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  let pkgResults: PkgRunResult[];

  if (pathsToRun.length === 0) {
    pkgResults = [];
  } else if (runIn === 'perPackage' && pathsToRun.length > 1) {
    // Parallel with concurrency limit
    pkgResults = [];
    for (let i = 0; i < pathsToRun.length; i += CHECKS_CONCURRENCY) {
      const batch = pathsToRun.slice(i, i + CHECKS_CONCURRENCY);
      pkgResults.push(...await Promise.all(batch.map(runForPath)));
      // Progress breadcrumb: if the *outer* governed process (the whole CLI
      // invocation) gets killed mid-run, this is the last thing on record
      // showing how far the check got — which package batch it was on, not
      // just a silent multi-minute gap before the kill.
      options.logger?.info?.(
        `Check ${check.id}: ${Math.min(i + CHECKS_CONCURRENCY, pathsToRun.length)}/${pathsToRun.length} packages checked`,
      );
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

function isTimeoutError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'PROCESS_TIMEOUT';
}

/**
 * Pull the killed process's buffered stdout/stderr/exit info out of a
 * GovernedProcessError, if present. node-backend.ts's `finish()` attaches
 * the full ProcessResult (including whatever output was captured before the
 * kill) as `details.result` on every governed-process rejection — timeout,
 * memory/cpu/output limit, or cancellation — not just PROCESS_SPAWN_FAILED.
 * Returns undefined for non-governed errors (e.g. a thrown JS error from
 * evaluateParser) so callers don't fabricate empty output fields for those.
 */
function partialResultOf(
  error: unknown,
): { stdout?: string; stderr?: string; exitCode?: number } | undefined {
  if (typeof error !== 'object' || error === null) { return undefined; }
  const details = (error as { details?: unknown }).details;
  if (typeof details !== 'object' || details === null) { return undefined; }
  const result = (details as { result?: unknown }).result;
  if (typeof result !== 'object' || result === null) { return undefined; }
  const r = result as { stdout?: unknown; stderr?: unknown; code?: unknown };
  return {
    stdout: typeof r.stdout === 'string' ? r.stdout : undefined,
    stderr: typeof r.stderr === 'string' ? r.stderr : undefined,
    exitCode: typeof r.code === 'number' ? r.code : undefined,
  };
}

function readPackageName(pkgPath: string): string | undefined {
  try {
    const pkg = JSON.parse(readFileSync(join(pkgPath, 'package.json'), 'utf8')) as { name?: unknown };
    return typeof pkg.name === 'string' ? pkg.name : undefined;
  } catch {
    return undefined;
  }
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
