/**
 * Release planner - detects changes and suggests version bumps
 */

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import simpleGit from 'simple-git';
import semver from 'semver';
import globby from 'globby';
import { discoverSubRepoPaths } from '@kb-labs/sdk';
import type { PackageVersion, VersionBump, ReleaseConfig, ReleasePlan } from './types';
import { applyVersionStrategy, type VersionStrategy } from './versioning-strategies';

export interface PlannerOptions {
  cwd: string;
  config: ReleaseConfig;
  scope?: string;
  bumpOverride?: VersionBump;
}

/**
 * Plan release by detecting changes and computing version bumps
 */
export async function planRelease(options: PlannerOptions): Promise<ReleasePlan> {
  const { cwd, config, scope, bumpOverride } = options;

  // Step 1: discover all candidates according to config (paths/include/exclude)
  const allPackages = await discoverPackages(cwd, config);

  // Step 2: if scope given, filter candidates and produce clear errors
  let packages: PackageVersion[];
  if (scope && scope !== 'root') {
    const isWorkspace = existsSync(join(cwd, '.gitmodules'));
    if (isWorkspace) {
      // In workspace mode, scope matches a sub-repo root.
      // Re-discover inside that sub-repo using standard discoverPackages (glob-based).
      const matchedRoots = filterByScope(allPackages, scope, config);
      const innerPackages: PackageVersion[] = [];
      for (const root of matchedRoots) {
        // Include root itself
        innerPackages.push(root);
        // Discover inner packages using standard glob logic (respects config, skips private)
        const inner = await discoverPackages(root.path, config);
        for (const pkg of inner) {
          if (!innerPackages.some(p => p.name === pkg.name)) {
            innerPackages.push(pkg);
          }
        }
      }
      packages = innerPackages;
    } else {
      packages = filterByScope(allPackages, scope, config);
    }
  } else {
    packages = allPackages;
  }

  // Workspace root with submodules: each sub-repo has its own git,
  // so we skip workspace-level detectModifiedPackages and use per-repo git.
  const isWorkspaceRoot = existsSync(join(cwd, '.gitmodules')) && !scope;

  let modifiedPackages: PackageVersion[];
  if (isWorkspaceRoot) {
    // All sub-repos are candidates — change detection happens per-repo
    modifiedPackages = packages;
  } else {
    const git = simpleGit(cwd, { timeout: { block: 60000 } });
    modifiedPackages = await detectModifiedPackages(git, packages);
  }

  // Compute version bumps
  let planPackages: PackageVersion[] = [];
  for (const pkg of modifiedPackages) {
    const bump = bumpOverride || config.bump || 'auto';

    // For workspace root, use per-sub-repo git instance
    const git = isWorkspaceRoot
      ? simpleGit(pkg.path, { timeout: { block: 60000 } })
      : simpleGit(cwd, { timeout: { block: 60000 } });

    const nextVersion = await computeNextVersion(
      pkg.path,
      pkg.currentVersion,
      bump,
      git
    );

    planPackages.push({
      ...pkg,
      nextVersion,
      bump: bump === 'auto' ? detectBumpType(pkg.currentVersion, nextVersion) : bump,
    });
  }

  // Apply versioning strategy (lockstep/independent/adaptive)
  // Top-level versioningStrategy takes priority over legacy changelog.bumpStrategy
  const bumpStrategy = config.versioningStrategy || config.changelog?.bumpStrategy || 'independent';
  const versionStrategy = mapBumpStrategyToVersionStrategy(bumpStrategy);

  planPackages = applyVersionStrategy(planPackages, {
    strategy: versionStrategy,
    umbrellaPath: scope,
  });

  return {
    packages: planPackages,
    strategy: config.strategy || 'semver',
    registry: config.registry || 'https://registry.npmjs.org',
    rollbackEnabled: config.rollback?.enabled ?? true,
  };
}

/**
 * Map changelog.bumpStrategy to VersionStrategy
 */
function mapBumpStrategyToVersionStrategy(
  bumpStrategy: 'independent' | 'ripple' | 'lockstep' | 'adaptive'
): VersionStrategy {
  if (bumpStrategy === 'lockstep') {return 'lockstep';}
  if (bumpStrategy === 'ripple' || bumpStrategy === 'adaptive') {return 'adaptive';}
  return 'independent';
}

/**
 * Discover all release candidates according to config.packages (paths/include/exclude).
 * Does NOT apply scope filtering — that's done separately in filterByScope().
 */
async function discoverPackages(cwd: string, config?: ReleaseConfig): Promise<PackageVersion[]> {
  // Workspace root with .gitmodules → sub-repos are the release units
  const isWorkspaceRoot = existsSync(join(cwd, '.gitmodules'));
  if (isWorkspaceRoot) {
    return discoverSubRepoPackages(cwd, config);
  }

  const packages: PackageVersion[] = [];

  // Scan dirs from config.packages.paths, or full tree
  const configPaths = config?.packages?.paths;
  const pattern = configPaths?.length
    ? configPaths.map(p => `${p}/package.json`)
    : '**/package.json';

  const packageJsonPaths = await globby(pattern, {
    cwd,
    absolute: true,
    onlyFiles: true,
    ignore: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.git/**',
      '**/.*/**',
    ],
  });

  for (let i = 0; i < packageJsonPaths.length; i++) {
    if (i % 10 === 0) {
      await new Promise((resolve) => { setImmediate(resolve); });
    }

    const packageJsonPath = packageJsonPaths[i]!;
    const packagePath = join(packageJsonPath, '..');
    const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf-8'));
    const isRootPackageJson = packageJsonPath === join(cwd, 'package.json');

    if (packageJson.private) {continue;}
    if (isRootPackageJson && existsSync(join(packagePath, 'pnpm-workspace.yaml'))) {continue;}
    if (isRootPackageJson && !packageJson.name) {continue;}

    // Apply global include/exclude from config.packages
    const globalFilter = config?.packages;
    if (globalFilter?.include?.length || globalFilter?.exclude?.length) {
      const rel = relative(cwd, packagePath);
      if (globalFilter.include?.length && !matchesPackagePattern(packageJson.name, rel, globalFilter.include)) {continue;}
      if (globalFilter.exclude?.length && matchesPackagePattern(packageJson.name, rel, globalFilter.exclude)) {continue;}
    }

    packages.push({
      name: packageJson.name,
      path: packagePath,
      currentVersion: packageJson.version,
      nextVersion: packageJson.version,
      bump: 'auto',
      isPublished: false,
    });
  }

  return packages;
}

/**
 * Filter discovered packages by scope with clear error messages.
 * Scope can be: exact name (@kb-labs/core), wildcard (@kb-labs/*), or path glob (packages/*).
 * Also applies per-scope include/exclude from config.scopes[scope].
 */
function filterByScope(
  packages: PackageVersion[],
  scope: string,
  config?: ReleaseConfig,
): PackageVersion[] {
  // Per-scope package overrides
  const scopeFilter = config?.scopes?.[scope]?.packages;
  const globalFilter = config?.packages;
  const mergedInclude = [...(globalFilter?.include ?? []), ...(scopeFilter?.include ?? [])];
  const mergedExclude = [...(globalFilter?.exclude ?? []), ...(scopeFilter?.exclude ?? [])];

  // Build scope matcher
  const isExactName = !scope.includes('*') && (scope.startsWith('@') || !scope.includes('/'));
  const scopeRegex = new RegExp(
    '^' + scope.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*') + '$'
  );

  const result: PackageVersion[] = [];

  for (const pkg of packages) {
    // Match by name or relative path depending on scope format
    const isPathPattern = scope.includes('/') && !scope.startsWith('@');
    const matchTarget = isPathPattern ? pkg.path : pkg.name;
    const matches = isExactName ? pkg.name === scope : scopeRegex.test(matchTarget);
    if (!matches) {continue;}

    // Apply per-scope include/exclude on top
    if (mergedInclude.length && !matchesPackagePattern(pkg.name, pkg.path, mergedInclude)) {continue;}
    if (mergedExclude.length && matchesPackagePattern(pkg.name, pkg.path, mergedExclude)) {continue;}

    result.push(pkg);
  }

  if (result.length === 0) {
    // Check if the scope would have matched something if not for exclude
    const wouldMatchExcluded = packages.some(p => {
      const matchTarget = isPathPattern(scope) ? p.path : p.name;
      const scopeMatches = isExactName ? p.name === scope : scopeRegex.test(matchTarget);
      if (!scopeMatches) {return false;}
      return mergedExclude.length > 0 && matchesPackagePattern(p.name, p.path, mergedExclude);
    });

    if (wouldMatchExcluded) {
      throw new Error(`Scope "${scope}" matches packages that are excluded by configuration`);
    }

    const globalInclude = globalFilter?.include;
    if (globalInclude?.length) {
      throw new Error(`Scope "${scope}" did not match any packages. Note: packages.include restricts discovery to: ${globalInclude.join(', ')}`);
    }

    throw new Error(`Scope "${scope}" did not match any discovered packages`);
  }

  return result;
}

function isPathPattern(scope: string): boolean {
  return scope.includes('/') && !scope.startsWith('@');
}

/**
 * Discover sub-repos as release units via .gitmodules.
 * Each sub-repo root package.json is a release unit (even if private).
 */
async function discoverSubRepoPackages(workspaceRoot: string, config?: ReleaseConfig): Promise<PackageVersion[]> {
  const subRepoPaths = discoverSubRepoPaths(workspaceRoot);
  const packages: PackageVersion[] = [];
  const globalFilter = config?.packages;

  for (const subRepoPath of subRepoPaths) {
    try {
      const pkgJson = JSON.parse(
        await readFile(join(subRepoPath, 'package.json'), 'utf-8')
      );
      if (!pkgJson.name) {continue;}

      const rel = relative(workspaceRoot, subRepoPath);

      // Apply global include/exclude
      if (globalFilter?.include?.length && !matchesPackagePattern(pkgJson.name, rel, globalFilter.include)) {continue;}
      if (globalFilter?.exclude?.length && matchesPackagePattern(pkgJson.name, rel, globalFilter.exclude)) {continue;}

      packages.push({
        name: pkgJson.name,
        path: subRepoPath,
        currentVersion: pkgJson.version || '0.0.0',
        nextVersion: pkgJson.version || '0.0.0',
        bump: 'auto',
        isPublished: false,
      });
    } catch {
      // Sub-repo without valid package.json — skip
    }
  }

  return packages;
}

/**
 * Check if file should be ignored (node_modules, dist, etc.)
 */
function shouldIgnoreFile(file: string): boolean {
  const ignoredPaths = [
    'node_modules/',
    '.git/',
    'dist/',
    'build/',
    '.next/',
    '.nuxt/',
    'coverage/',
    '.cache/',
    'tmp/',
  ];

  return ignoredPaths.some(path => file.includes(path));
}

async function detectModifiedPackages(
  git: ReturnType<typeof simpleGit>,
  packages: PackageVersion[]
): Promise<PackageVersion[]> {

  // Get list of modified files
  const status = await git.status();
  const diffSummary = await git.diffSummary(['HEAD']);

  // Filter out node_modules and other build artifacts
  const modifiedPaths = [
    ...status.files.map(f => f.path),
    ...diffSummary.files.map(f => f.file),
  ].filter(path => !shouldIgnoreFile(path));


  // Find packages that have changes
  const modified: PackageVersion[] = [];
  for (let i = 0; i < packages.length; i++) {
    // Освобождаем event loop каждые 10 пакетов
    if (i % 10 === 0) {
      await new Promise((resolve) => {
        setImmediate(resolve);
      });
    }

    const pkg = packages[i]!;

    // Check if any file in this package is modified
    const packageModified = modifiedPaths.some(path =>
      path.startsWith(pkg.path) || path.includes(pkg.name)
    );

    if (packageModified) {
      modified.push(pkg);
    }
  }


  // If no modified packages detected, include all packages (for initial release)
  return modified.length > 0 ? modified : packages;
}

async function computeNextVersion(
  packagePath: string,
  currentVersion: string,
  bump: VersionBump,
  git: ReturnType<typeof simpleGit>
): Promise<string> {

  // If auto, detect from conventional commits
  if (bump === 'auto') {
    const detectedBump = await detectVersionFromCommits(git, packagePath);
    return semver.inc(currentVersion, detectedBump) || currentVersion;
  }

  // Manual bump
  return semver.inc(currentVersion, bump) || currentVersion;
}

async function detectVersionFromCommits(
  git: ReturnType<typeof simpleGit>,
  packagePath: string
): Promise<'major' | 'minor' | 'patch'> {

  try {
    // Get recent commits for this package

    const log = await git.log({
      maxCount: 50,
      file: packagePath,
    });


    let hasMinor = false;
    let hasBreaking = false;

    for (const commit of log.all) {
      const message = commit.message.toLowerCase();

      // Detect conventional commits
      if (message.includes('!:')) {
        hasBreaking = true;
      } else if (message.startsWith('feat') || message.startsWith('feature')) {
        hasMinor = true;
      }
      // else if fix/bugfix -> patch level (default)
    }

    // If breaking change detected
    if (hasBreaking) {
      return 'major';
    }

    // If feature added
    if (hasMinor) {
      return 'minor';
    }

    // Default to patch
    return 'patch';
  } catch (error) {
    // On error, default to patch
    return 'patch';
  }
}

function detectBumpType(currentVersion: string, nextVersion: string): VersionBump {
  if (semver.major(currentVersion) < semver.major(nextVersion)) {
    return 'major';
  }
  if (semver.minor(currentVersion) < semver.minor(nextVersion)) {
    return 'minor';
  }
  return 'patch';
}

/**
 * Match a package against a list of patterns.
 * - Patterns starting with '@' or without '/' → matched against package name.
 * - Patterns containing '/' (non-scoped) → matched against relative path.
 * - Supports '*' wildcard (single path segment, not separator).
 */
export function matchesPackagePattern(pkgName: string, relativePath: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    const isPathPattern = pattern.includes('/') && !pattern.startsWith('@');
    const target = isPathPattern ? relativePath : pkgName;
    const regex = new RegExp(
      '^' + pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*') + '$'
    );
    if (regex.test(target)) {return true;}
  }
  return false;
}

