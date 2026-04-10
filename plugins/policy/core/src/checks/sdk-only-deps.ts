import fs from 'node:fs';
import path from 'node:path';
import type { PolicyConfig, PolicyViolation } from '@kb-labs/policy-contracts';
import { getRepoPackageNames } from '../core/workspace-scanner.js';

/**
 * Checks that all packages in the repo only depend on @kb-labs/sdk
 * and their own internal packages (within the same repo).
 */
export async function checkSdkOnlyDeps(
  repoPath: string,
  _config: PolicyConfig,
  workspaceRoot: string,
): Promise<PolicyViolation[]> {
  const violations: PolicyViolation[] = [];
  const absRepoPath = path.resolve(workspaceRoot, repoPath);
  const internalPackageNames = new Set(getRepoPackageNames(workspaceRoot, repoPath));

  const packageJsonPaths = findPackageJsonPaths(absRepoPath);

  for (const pkgJsonPath of packageJsonPaths) {
    let json: { name?: string; dependencies?: Record<string, string> };
    try {
      json = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
    } catch {
      continue;
    }

    const deps = Object.keys(json.dependencies ?? {});
    const packageName = json.name ?? path.basename(path.dirname(pkgJsonPath));
    const relPath = path.relative(workspaceRoot, pkgJsonPath);

    for (const dep of deps) {
      if (!dep.startsWith('@kb-labs/')) {continue;}
      if (dep === '@kb-labs/sdk') {continue;}
      if (internalPackageNames.has(dep)) {continue;}

      violations.push({
        rule: 'sdk-only-deps',
        severity: 'error',
        message: `${packageName} imports ${dep} directly`,
        package: packageName,
        detail: `Plugins must depend only on @kb-labs/sdk. Move needed types to SDK or use SDK re-exports.`,
        file: relPath,
      });
    }
  }

  return violations;
}

function findPackageJsonPaths(absRepoPath: string): string[] {
  const results: string[] = [];
  for (const subdir of ['packages', 'apps']) {
    const subdirPath = path.join(absRepoPath, subdir);
    if (!fs.existsSync(subdirPath)) {continue;}
    for (const entry of fs.readdirSync(subdirPath)) {
      const pkgJsonPath = path.join(subdirPath, entry, 'package.json');
      if (fs.existsSync(pkgJsonPath)) {results.push(pkgJsonPath);}
    }
  }
  return results;
}
