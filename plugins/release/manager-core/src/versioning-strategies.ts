/**
 * Versioning strategies for monorepo package releases
 *
 * - lockstep: All packages get the same version (maximum bump)
 * - independent: Each package has its own version
 * - adaptive: Lockstep if breaking changes, otherwise independent
 */

import semver from 'semver';
import type { PackageVersion, VersionBump } from './types';

export type VersionStrategy = 'lockstep' | 'independent' | 'adaptive';

export interface StrategyOptions {
  strategy: VersionStrategy;
  umbrellaPath?: string; // path to umbrella root (for filtering)
}

/**
 * Apply versioning strategy to packages
 */
export function applyVersionStrategy(
  packages: PackageVersion[],
  options: StrategyOptions
): PackageVersion[] {
  if (options.strategy === 'lockstep') {
    return applyLockstep(packages);
  }

  if (options.strategy === 'adaptive') {
    return applyAdaptive(packages);
  }

  // independent (default) - no changes needed
  return packages;
}

/**
 * Lockstep: All packages get the maximum version bump
 *
 * Example:
 * - Package A: 1.0.0 -> 1.1.0 (minor)
 * - Package B: 1.0.0 -> 2.0.0 (major)
 * Result: Both get 2.0.0 (maximum bump = major)
 */
function applyLockstep(packages: PackageVersion[]): PackageVersion[] {
  if (packages.length === 0) {return packages;}

  // Find the maximum bump level
  const maxBump = getMaxBump(packages);

  // Find the highest current version
  const maxVersion = packages.reduce((max, pkg) => {
    return semver.gt(pkg.currentVersion, max) ? pkg.currentVersion : max;
  }, packages[0]!.currentVersion); // ! safe: length already checked

  // Compute next version from max version + max bump
  // Filter out 'auto' since semver.inc expects ReleaseType
  const releaseType = maxBump === 'auto' ? 'patch' : maxBump;
  const nextVersion = semver.inc(maxVersion, releaseType) || maxVersion;

  // Apply to all packages
  return packages.map(pkg => ({
    ...pkg,
    bump: maxBump,
    nextVersion,
  }));
}

/**
 * Adaptive: Lockstep if breaking changes, otherwise independent
 *
 * This is useful for umbrellas where you want to keep versions in sync
 * when there are breaking changes, but allow independent releases otherwise.
 */
function applyAdaptive(packages: PackageVersion[]): PackageVersion[] {
  const hasBreaking = packages.some(pkg => pkg.bump === 'major');

  // If any package has breaking changes, use lockstep
  if (hasBreaking) {
    return applyLockstep(packages);
  }

  // Otherwise, use independent (no changes)
  return packages;
}

/**
 * Get the maximum bump level from a list of packages
 *
 * Priority: major > minor > patch
 */
function getMaxBump(packages: PackageVersion[]): VersionBump {
  let maxBump: VersionBump = 'patch';

  for (const pkg of packages) {
    if (pkg.bump === 'major') {
      return 'major'; // Can't go higher than major
    }
    if (pkg.bump === 'minor') {
      maxBump = 'minor';
    }
  }

  return maxBump;
}
