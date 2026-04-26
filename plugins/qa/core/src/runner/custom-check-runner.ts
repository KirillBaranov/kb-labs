import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import type { QACheckConfig, QAResults, WorkspacePackage } from '@kb-labs/qa-contracts';
import { sortByBuildLayers } from './build-order.js';

type Bucket = { passed: string[]; failed: string[]; skipped: string[]; errors: Record<string, string> };
type ProgressFn = (checkId: string, pkg: string, status: 'pass' | 'fail' | 'skip', durationMs?: number) => void;

const ID_MAP: Record<string, string> = {
  build: 'build', lint: 'lint',
  typecheck: 'typeCheck', 'type-check': 'typeCheck',
  test: 'test', tests: 'test',
};

function emptyResult(): Bucket {
  return { passed: [], failed: [], skipped: [], errors: {} };
}

function runCommand(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
): { ok: boolean; stdout: string; stderr: string; exitCode: number } {
  try {
    const result = spawnSync(command, args, { cwd, timeout: timeoutMs, encoding: 'utf-8', shell: false });
    const stdout = result.stdout ?? '';
    const stderr = result.stderr ?? '';
    const exitCode = result.status ?? 1;
    return { ok: exitCode === 0, stdout, stderr, exitCode };
  } catch (e: unknown) {
    return { ok: false, stdout: '', stderr: e instanceof Error ? e.message : String(e), exitCode: 1 };
  }
}

function evaluate(check: QACheckConfig, stdout: string, stderr: string, exitCode: number): boolean {
  if ((check.parser ?? 'exitcode') === 'json') {
    try {
      const parsed = JSON.parse(stdout);
      return parsed.ok === true || parsed.success === true || parsed.status === 'ok';
    } catch {
      return false;
    }
  }
  return exitCode === 0;
}

function recordResult(
  bucket: Bucket, key: string, passed: boolean,
  stdout: string, stderr: string, exitCode: number,
  canonicalId: string, onProgress: ProgressFn | undefined, durationMs: number,
): void {
  if (passed) {
    bucket.passed.push(key);
    onProgress?.(canonicalId, key, 'pass', durationMs);
  } else {
    bucket.failed.push(key);
    bucket.errors[key] = stderr || stdout || `Exit code ${exitCode}`;
    onProgress?.(canonicalId, key, 'fail', durationMs);
  }
}

function runInRepoRoot(
  check: QACheckConfig, canonicalId: string, resolvedArgs: string[],
  rootDir: string, bucket: Bucket, onProgress: ProgressFn | undefined,
): void {
  const startMs = Date.now();
  const { stderr, exitCode, stdout } = runCommand(check.command, resolvedArgs, rootDir, check.timeoutMs ?? 120_000);
  recordResult(bucket, rootDir, evaluate(check, stdout, stderr, exitCode), stdout, stderr, exitCode, canonicalId, onProgress, Date.now() - startMs);
}

function runInScopePath(
  check: QACheckConfig, canonicalId: string, resolvedArgs: string[],
  packages: WorkspacePackage[], rootDir: string, bucket: Bucket, onProgress: ProgressFn | undefined,
): void {
  const seen = new Set<string>();
  for (const pkg of packages) {
    if (seen.has(pkg.repo)) { continue; }
    seen.add(pkg.repo);
    const scopeDir = resolve(rootDir, pkg.repo);
    if (!existsSync(scopeDir)) { continue; }
    const startMs = Date.now();
    const { stderr, exitCode, stdout } = runCommand(check.command, resolvedArgs, scopeDir, check.timeoutMs ?? 120_000);
    recordResult(bucket, pkg.repo, evaluate(check, stdout, stderr, exitCode), stdout, stderr, exitCode, canonicalId, onProgress, Date.now() - startMs);
  }
}

function getPnpmScriptName(check: QACheckConfig): string | undefined {
  if (check.command !== 'pnpm') { return undefined; }
  const args = check.args ?? [];
  if (args[0] === 'run' && args[1]) { return args[1]; }
  return undefined;
}

function hasNpmScript(pkgDir: string, scriptName: string): boolean {
  try {
    const pkgJson = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf-8'));
    return typeof pkgJson?.scripts?.[scriptName] === 'string';
  } catch {
    return false;
  }
}

function runPerPackage(
  check: QACheckConfig, canonicalId: string, resolvedArgs: string[],
  packages: WorkspacePackage[], bucket: Bucket, onProgress: ProgressFn | undefined,
): void {
  const sortedPackages = check.ordered ? sortByBuildLayers(packages) : packages;
  const scriptName = getPnpmScriptName(check);

  for (const pkg of sortedPackages) {
    if (scriptName && !hasNpmScript(pkg.dir, scriptName)) {
      bucket.skipped.push(pkg.name);
      onProgress?.(canonicalId, pkg.name, 'skip');
      continue;
    }
    const startMs = Date.now();
    const { stderr, exitCode, stdout } = runCommand(check.command, resolvedArgs, pkg.dir, check.timeoutMs ?? 120_000);
    recordResult(bucket, pkg.name, evaluate(check, stdout, stderr, exitCode), stdout, stderr, exitCode, canonicalId, onProgress, Date.now() - startMs);
  }
}

export function runCustomChecks(
  checks: QACheckConfig[],
  packages: WorkspacePackage[],
  rootDir: string,
  onProgress?: ProgressFn,
): QAResults {
  const results: QAResults = {};

  for (const check of checks) {
    const canonicalId = ID_MAP[check.id.toLowerCase()] ?? check.id;
    if (!results[canonicalId]) { results[canonicalId] = emptyResult(); }
    const bucket = results[canonicalId]!;

    const args = check.args ?? [];
    const resolvedArgs = args.map(arg =>
      (arg.match(/\.(sh|js|ts|mjs|cjs)$/) && !arg.startsWith('/')) ? join(rootDir, arg) : arg
    );

    const runIn = check.runIn ?? 'perPackage';

    if (runIn === 'repoRoot') {
      runInRepoRoot(check, canonicalId, resolvedArgs, rootDir, bucket, onProgress);
    } else if (runIn === 'scopePath') {
      runInScopePath(check, canonicalId, resolvedArgs, packages, rootDir, bucket, onProgress);
    } else {
      runPerPackage(check, canonicalId, resolvedArgs, packages, bucket, onProgress);
    }
  }

  return results;
}
