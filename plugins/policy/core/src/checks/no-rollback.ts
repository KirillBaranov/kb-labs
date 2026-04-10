import fs from 'node:fs';
import path from 'node:path';
// FIX 1 (CRITICAL): replaced execSync with spawnSync so packageName is passed as
// a literal argument — never interpolated into a shell command string.
// execSync with a template literal was vulnerable to shell injection if packageName
// contained shell metacharacters (e.g. `$(cmd)`, backticks, semicolons).
import { spawnSync } from 'node:child_process';
import type { PolicyConfig, PolicyViolation } from '@kb-labs/policy-contracts';
import semver from 'semver';

/**
 * Checks that the current version in package.json is not less than the published npm version.
 */
export async function checkNoRollback(
  repoPath: string,
  _config: PolicyConfig,
  workspaceRoot: string,
): Promise<PolicyViolation[]> {
  const violations: PolicyViolation[] = [];
  const absRepoPath = path.resolve(workspaceRoot, repoPath);
  const packageJsonPaths = findPackageJsonPaths(absRepoPath);

  for (const pkgJsonPath of packageJsonPaths) {
    let json: { name?: string; version?: string; private?: boolean };
    try {
      json = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
    } catch {
      continue;
    }

    if (!json.name || !json.version) {continue;}
    if (json.private) {continue;} // private packages are not published

    const packageName = json.name;
    const currentVersion = json.version;
    const relPath = path.relative(workspaceRoot, pkgJsonPath);

    const publishedVersion = getPublishedVersion(packageName);
    if (publishedVersion === null) {
      // Not published or npm unavailable — skip
      continue;
    }

    if (!semver.gte(currentVersion, publishedVersion)) {
      violations.push({
        rule: 'no-rollback',
        severity: 'error',
        message: `${packageName} version ${currentVersion} is less than published ${publishedVersion}`,
        package: packageName,
        detail: `Cannot decrease version once published to npm. Restore to ${publishedVersion} or higher.`,
        file: relPath,
      });
    }
  }

  return violations;
}

/**
 * Returns the published npm version for a package, or null if not published / offline.
 */
function getPublishedVersion(packageName: string): string | null {
  // spawnSync receives packageName as a discrete argv element — the OS never
  // passes it through a shell, so metacharacters cannot be interpreted.
  const result = spawnSync('npm', ['show', packageName, 'version', '--silent'], {
    timeout: 10000,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  if (result.error || result.status !== 0) {return null;}
  return semver.valid(result.stdout.trim()) ?? null;
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
