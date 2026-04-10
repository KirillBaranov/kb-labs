import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PackageImpact, TestImpact } from '@kb-labs/impact-contracts';

const TEST_DIRS = ['tests', 'test', '__tests__'];
const TEST_PATTERNS = ['.test.ts', '.spec.ts', '.test.tsx', '.spec.tsx'];

function findPackageDir(workspaceRoot: string, repo: string, packageName: string): string | null {
  const repoPath = join(workspaceRoot, repo);
  const packagesDir = join(repoPath, 'packages');

  if (!existsSync(packagesDir)) {
    // Repo without packages/ — the repo itself is the package
    return repoPath;
  }

  // Search for the package by name in package.json files
  for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) {continue;}
    const pkgJsonPath = join(packagesDir, entry.name, 'package.json');
    if (!existsSync(pkgJsonPath)) {continue;}
    try {
      const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
      if (pkg.name === packageName) {
        return join(packagesDir, entry.name);
      }
    } catch { /* skip */ }
  }

  return null;
}

function countTestFiles(dir: string): number {
  let count = 0;

  function walk(d: string): void {
    if (!existsSync(d)) {return;}
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist') {continue;}
      const full = join(d, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (TEST_PATTERNS.some((p) => entry.name.endsWith(p))) {
        count++;
      }
    }
  }

  walk(dir);
  return count;
}

function detectTests(packageDir: string): { hasTests: boolean; testCount: number } {
  // Check dedicated test directories
  for (const testDir of TEST_DIRS) {
    const fullPath = join(packageDir, testDir);
    if (existsSync(fullPath)) {
      const count = countTestFiles(fullPath);
      if (count > 0) {return { hasTests: true, testCount: count };}
    }
  }

  // Also check src/ for co-located test files
  const srcDir = join(packageDir, 'src');
  if (existsSync(srcDir)) {
    const count = countTestFiles(srcDir);
    if (count > 0) {return { hasTests: true, testCount: count };}
  }

  return { hasTests: false, testCount: 0 };
}

export function analyzeTestImpact(
  allImpacted: PackageImpact[],
  workspaceRoot: string,
): { mustRun: TestImpact[]; noTests: TestImpact[] } {
  const mustRun: TestImpact[] = [];
  const noTests: TestImpact[] = [];

  for (const pkg of allImpacted) {
    const pkgDir = findPackageDir(workspaceRoot, pkg.repo, pkg.name);
    const { hasTests, testCount } = pkgDir ? detectTests(pkgDir) : { hasTests: false, testCount: 0 };

    const impact: TestImpact = {
      name: pkg.name,
      repo: pkg.repo,
      level: pkg.level,
      reason: pkg.reason,
      hasTests,
      testCount: hasTests ? testCount : undefined,
      command: hasTests ? `pnpm --filter ${pkg.name} run test` : undefined,
    };

    if (hasTests) {
      mustRun.push(impact);
    } else {
      noTests.push(impact);
    }
  }

  return { mustRun, noTests };
}
