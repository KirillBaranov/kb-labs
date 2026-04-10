import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CheckResult, WorkspacePackage } from '@kb-labs/qa-contracts';

interface TestRunnerOptions {
  rootDir: string;
  packages: WorkspacePackage[];
  onProgress?: (pkg: string, status: 'pass' | 'fail' | 'skip', durationMs?: number) => void;
}

/**
 * Run Vitest tests on all packages.
 * Uses --passWithNoTests so packages without tests pass.
 */
export function runTestCheck(options: TestRunnerOptions): CheckResult {
  const { packages, onProgress } = options;
  const result: CheckResult = { passed: [], failed: [], skipped: [], errors: {} };

  for (const pkg of packages) {
    // Check if package has test script
    let pkgJson: any;
    try {
      pkgJson = JSON.parse(
        readFileSync(join(pkg.dir, 'package.json'), 'utf-8')
      );
    } catch {
      result.skipped.push(pkg.name);
      onProgress?.(pkg.name, 'skip');
      continue;
    }

    if (!pkgJson.scripts?.test) {
      result.skipped.push(pkg.name);
      onProgress?.(pkg.name, 'skip');
      continue;
    }

    const startMs = Date.now();
    try {
      execSync('pnpm run test', {
        cwd: pkg.dir,
        encoding: 'utf-8',
        timeout: 120000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      result.passed.push(pkg.name);
      onProgress?.(pkg.name, 'pass', Date.now() - startMs);
    } catch (err: any) {
      result.failed.push(pkg.name);
      const rawErr = (err.stdout || err.stderr || err.message || '').trim();
      result.errors[pkg.name] = rawErr.slice(0, 2000) || `Test failed (exit code ${err.status ?? 1})`;
      onProgress?.(pkg.name, 'fail', Date.now() - startMs);
    }
  }

  return result;
}
