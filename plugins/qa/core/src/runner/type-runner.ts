import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { CheckResult, WorkspacePackage } from '@kb-labs/qa-contracts';

interface TypeRunnerOptions {
  rootDir: string;
  packages: WorkspacePackage[];
  onProgress?: (pkg: string, status: 'pass' | 'fail' | 'skip', durationMs?: number) => void;
}

/**
 * Run TypeScript type checking on all packages.
 */
export function runTypeCheck(options: TypeRunnerOptions): CheckResult {
  const { packages, onProgress } = options;
  const result: CheckResult = { passed: [], failed: [], skipped: [], errors: {} };

  for (const pkg of packages) {
    const tsconfigPath = join(pkg.dir, 'tsconfig.json');
    if (!existsSync(tsconfigPath)) {
      result.skipped.push(pkg.name);
      onProgress?.(pkg.name, 'skip');
      continue;
    }

    const startMs = Date.now();
    try {
      execSync('pnpm exec tsc --noEmit', {
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
      result.errors[pkg.name] = rawErr.slice(0, 2000) || `Type check failed (exit code ${err.status ?? 1})`;
      onProgress?.(pkg.name, 'fail', Date.now() - startMs);
    }
  }

  return result;
}
