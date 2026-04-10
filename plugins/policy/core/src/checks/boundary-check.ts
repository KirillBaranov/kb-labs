import fs from 'node:fs';
import path from 'node:path';
import type { PolicyConfig, PolicyViolation } from '@kb-labs/policy-contracts';
import { buildPackageMap, getRepoPackageNames } from '../core/workspace-scanner.js';
import { checkSdkOnlyDeps } from './sdk-only-deps.js';

/**
 * Checks that packages only depend on packages from allowed categories.
 * If allowed contains "sdk-only", delegates to sdk-only-deps logic.
 */
export async function checkBoundary(
  repoPath: string,
  config: PolicyConfig,
  workspaceRoot: string,
): Promise<PolicyViolation[]> {
  const violations: PolicyViolation[] = [];

  // Find the category for this repo
  const { detectCategory } = await import('../core/category-resolver.js');
  const categoryResult = detectCategory(repoPath, config);
  const category = categoryResult.category;

  if (!category) {return violations;} // no category = no boundary config

  const boundaryRuleConfig = config.rules['boundary-check']?.config as
    | { allowed?: Record<string, string[]> }
    | undefined;
  const allowedCategories = boundaryRuleConfig?.allowed?.[category] ?? [];

  // If "sdk-only" is in allowed, delegate to sdk-only-deps
  if (allowedCategories.includes('sdk-only')) {
    return checkSdkOnlyDeps(repoPath, config, workspaceRoot);
  }

  const packageMap = buildPackageMap(workspaceRoot, config);
  const internalPackageNames = new Set(getRepoPackageNames(workspaceRoot, repoPath));
  const absRepoPath = path.resolve(workspaceRoot, repoPath);

  for (const pkgJsonPath of findPackageJsonPaths(absRepoPath)) {
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
      if (internalPackageNames.has(dep)) {continue;} // own package = always ok

      const depCategory = packageMap.get(dep);
      if (depCategory === undefined || depCategory === null) {continue;} // unknown package, skip

      if (!allowedCategories.includes(depCategory)) {
        violations.push({
          rule: 'boundary-check',
          severity: 'error',
          message: `${packageName} depends on ${dep} (category: ${depCategory ?? 'unknown'})`,
          package: packageName,
          detail: `Category "${category}" may only depend on: ${allowedCategories.join(', ')}`,
          file: relPath,
        });
      }
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
