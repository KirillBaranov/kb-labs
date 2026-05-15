import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import type { QACheckConfig, QAResults, WorkspacePackage, CheckItem } from '@kb-labs/qa-contracts';
import { sortByBuildLayers } from './build-order.js';

type Bucket = { passed: string[]; failed: string[]; skipped: string[]; errors: Record<string, string>; details: Record<string, CheckItem[]> };
type ProgressFn = (checkId: string, pkg: string, status: 'pass' | 'fail' | 'skip', durationMs?: number) => void;

const ID_MAP: Record<string, string> = {
  build: 'build', lint: 'lint',
  typecheck: 'typeCheck', 'type-check': 'typeCheck',
  test: 'test', tests: 'test',
};

function emptyResult(): Bucket {
  return { passed: [], failed: [], skipped: [], errors: {}, details: {} };
}

function runCommand(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
  extraEnv?: Record<string, string>,
): { ok: boolean; stdout: string; stderr: string; exitCode: number } {
  try {
    const env = extraEnv ? { ...process.env, ...extraEnv } : undefined;
    const result = spawnSync(command, args, { cwd, timeout: timeoutMs, encoding: 'utf-8', shell: false, env });
    const stdout = result.stdout ?? '';
    const stderr = result.stderr ?? '';
    const exitCode = result.status ?? 1;
    return { ok: exitCode === 0, stdout, stderr, exitCode };
  } catch (e: unknown) {
    return { ok: false, stdout: '', stderr: e instanceof Error ? e.message : String(e), exitCode: 1 };
  }
}

function parseTypedOutput(stdout: string): { ok: boolean; items: CheckItem[] } | null {
  try {
    const parsed = JSON.parse(stdout);
    if (typeof parsed === 'object' && parsed !== null && 'ok' in parsed) {
      return {
        ok: parsed.ok === true,
        items: Array.isArray(parsed.items) ? parsed.items : [],
      };
    }
  } catch {
    // not JSON
  }
  return null;
}

function evaluate(check: QACheckConfig, stdout: string, stderr: string, exitCode: number): boolean {
  if ((check.parser ?? 'exitcode') === 'json') {
    const typed = parseTypedOutput(stdout);
    if (typed !== null) { return typed.ok; }
    // fallback: legacy json format
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
  check: QACheckConfig, canonicalId: string,
  onProgress: ProgressFn | undefined, durationMs: number,
): void {
  if (passed) {
    bucket.passed.push(key);
    onProgress?.(canonicalId, key, 'pass', durationMs);
  } else {
    bucket.failed.push(key);
    bucket.errors[key] = stderr || stdout || `Exit code ${exitCode}`;
    // Capture structured items for json parser
    if ((check.parser ?? 'exitcode') === 'json') {
      const typed = parseTypedOutput(stdout);
      if (typed && typed.items.length > 0) {
        bucket.details[key] = typed.items;
      }
    }
    onProgress?.(canonicalId, key, 'fail', durationMs);
  }
}

/**
 * Get the set of package relative paths touched by the current branch diff.
 * diffFilter: '' = all changed, 'A' = only added files.
 */
function getDiffPackageDirs(rootDir: string, base: string, diffFilter: string): Set<string> {
  try {
    const args = ['diff', `${base}...HEAD`, '--name-only'];
    if (diffFilter) { args.push(`--diff-filter=${diffFilter}`); }
    const result = spawnSync('git', args, { cwd: rootDir, encoding: 'utf-8' });
    const output = (result.stdout ?? '').trim();
    if (!output) { return new Set(); }
    return new Set(output.split('\n').map(f => f.split('/')[0]).filter((s): s is string => Boolean(s)));
  } catch {
    return new Set();
  }
}

function filterPackagesByDiff(packages: WorkspacePackage[], rootDir: string, diffFilter: string, base: string): WorkspacePackage[] {
  const touchedDirs = getDiffPackageDirs(rootDir, base, diffFilter);
  if (touchedDirs.size === 0) { return []; }
  return packages.filter(pkg => {
    const relParts = pkg.relativePath.split('/');
    // Match if any path segment prefix matches touched top-level dirs
    return relParts.some((_, i) => touchedDirs.has(relParts.slice(0, i + 1).join('/')));
  });
}

function runInRepoRoot(
  check: QACheckConfig, canonicalId: string, resolvedArgs: string[],
  rootDir: string, bucket: Bucket, onProgress: ProgressFn | undefined,
  diffBase?: string,
): void {
  const startMs = Date.now();
  const env = diffBase ? { KB_QA_BASE: diffBase } : undefined;
  const { stderr, exitCode, stdout } = runCommand(check.command, resolvedArgs, rootDir, check.timeoutMs ?? 120_000, env);
  recordResult(bucket, rootDir, evaluate(check, stdout, stderr, exitCode), stdout, stderr, exitCode, check, canonicalId, onProgress, Date.now() - startMs);
}

function runInScopePath(
  check: QACheckConfig, canonicalId: string, resolvedArgs: string[],
  packages: WorkspacePackage[], rootDir: string, bucket: Bucket, onProgress: ProgressFn | undefined,
  diffBase?: string,
): void {
  const seen = new Set<string>();
  const env = diffBase ? { KB_QA_BASE: diffBase } : undefined;
  for (const pkg of packages) {
    if (seen.has(pkg.repo)) { continue; }
    seen.add(pkg.repo);
    const scopeDir = resolve(rootDir, pkg.repo);
    if (!existsSync(scopeDir)) { continue; }
    const startMs = Date.now();
    const { stderr, exitCode, stdout } = runCommand(check.command, resolvedArgs, scopeDir, check.timeoutMs ?? 120_000, env);
    recordResult(bucket, pkg.repo, evaluate(check, stdout, stderr, exitCode), stdout, stderr, exitCode, check, canonicalId, onProgress, Date.now() - startMs);
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
  diffBase?: string,
): void {
  const sortedPackages = check.ordered ? sortByBuildLayers(packages) : packages;
  const scriptName = getPnpmScriptName(check);
  const env = diffBase ? { KB_QA_BASE: diffBase } : undefined;

  for (const pkg of sortedPackages) {
    if (scriptName && !hasNpmScript(pkg.dir, scriptName)) {
      bucket.skipped.push(pkg.name);
      onProgress?.(canonicalId, pkg.name, 'skip');
      continue;
    }
    const startMs = Date.now();
    const { stderr, exitCode, stdout } = runCommand(check.command, resolvedArgs, pkg.dir, check.timeoutMs ?? 120_000, env);
    recordResult(bucket, pkg.name, evaluate(check, stdout, stderr, exitCode), stdout, stderr, exitCode, check, canonicalId, onProgress, Date.now() - startMs);
  }
}

export function runCustomChecks(
  checks: QACheckConfig[],
  packages: WorkspacePackage[],
  rootDir: string,
  onProgress?: ProgressFn,
  diffBase?: string,
): QAResults {
  const results: QAResults = {};

  for (const check of checks) {
    const canonicalId = ID_MAP[check.id.toLowerCase()] ?? check.id;
    if (!results[canonicalId]) { results[canonicalId] = emptyResult(); }
    const bucket = results[canonicalId]! as Bucket;

    const args = check.args ?? [];
    const resolvedArgs = args.map(arg =>
      (arg.match(/\.(sh|js|ts|mjs|cjs)$/) && !arg.startsWith('/')) ? join(rootDir, arg) : arg
    );

    const runIn = check.runIn ?? 'perPackage';

    if (runIn === 'repoRoot') {
      runInRepoRoot(check, canonicalId, resolvedArgs, rootDir, bucket, onProgress, diffBase);
    } else if (runIn === 'scopePath') {
      runInScopePath(check, canonicalId, resolvedArgs, packages, rootDir, bucket, onProgress, diffBase);
    } else if (runIn === 'diffOnly' || runIn === 'newFiles') {
      const base = diffBase ?? 'main';
      const diffFilter = runIn === 'newFiles' ? 'A' : '';
      const filteredPackages = filterPackagesByDiff(packages, rootDir, diffFilter, base);
      if (filteredPackages.length === 0) {
        // No affected packages — skip entirely, not a failure
        bucket.skipped.push(...packages.map(p => p.name));
        for (const pkg of packages) { onProgress?.(canonicalId, pkg.name, 'skip'); }
      } else {
        // Packages not touched by diff → skip them
        const filteredNames = new Set(filteredPackages.map(p => p.name));
        for (const pkg of packages) {
          if (!filteredNames.has(pkg.name)) {
            bucket.skipped.push(pkg.name);
            onProgress?.(canonicalId, pkg.name, 'skip');
          }
        }
        runPerPackage(check, canonicalId, resolvedArgs, filteredPackages, bucket, onProgress, base);
      }
    } else {
      runPerPackage(check, canonicalId, resolvedArgs, packages, bucket, onProgress);
    }

    // Promote details to CheckResult if any items were captured
    if (Object.keys(bucket.details).length > 0) {
      results[canonicalId]!.details = bucket.details;
    }
  }

  return results;
}
