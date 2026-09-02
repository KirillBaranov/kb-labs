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

  // Idempotent retry: the planner's per-package guard (planner.ts) already
  // resolved nextVersion back to currentVersion — without a fresh bump — for
  // any package whose bump is already applied on disk. That decision must
  // survive lockstep resolution unchanged: re-deriving nextVersion from
  // currentVersion here would bump a SECOND time on top of an already-applied
  // bump, producing a git tag/commit one version ahead of what's actually in
  // package.json.
  //
  // Both signals matter, and `isPublished` alone is NOT sufficient:
  //   - isPublished   — bump applied AND live on npm (publish succeeded, only
  //                     git commit/tag remains).
  //   - versionPinned — bump applied on disk, not yet published. This is the
  //                     ordinary `release:version` → `release:git` handoff,
  //                     where nothing is on npm yet. Gating on isPublished
  //                     alone let this case fall through to a second bump.
  const pinned = packages.filter(p => p.isPublished || p.versionPinned);
  if (pinned.length > 0) {
    // In lockstep every package shares one version, so the already-resolved
    // ones must agree. If they don't, the plan is incoherent — fail here with
    // the actual versions rather than silently collapsing to the max and
    // tripping assertTagVersionsMatchDisk() later, after the commit is made.
    const resolved = [...new Set(pinned.map(p => p.nextVersion))];
    if (resolved.length > 1) {
      const detail = pinned.map(p => `${p.name}@${p.nextVersion}`).join(', ');
      throw new Error(
        `Lockstep release has conflicting already-resolved versions: ${resolved.join(', ')} (${detail}). ` +
        'Reconcile package.json versions before releasing.',
      );
    }
    const sharedVersion = resolved[0]!;
    return packages.map(pkg => ({ ...pkg, nextVersion: sharedVersion }));
  }

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
 * Raise already-computed `nextVersion` values to a version allocated by the
 * release ledger.
 *
 * This replaces the pre-cutover `applyCanarySuffix()`. Under the old model a
 * canary was `1.2.3-canary.<shortsha>` — an in-memory prerelease that was never
 * committed and could not be promoted to stable without a rename. Cutover plan
 * §3 requires the opposite: a canary receives a **final** SemVer, monotonic
 * against every version the ledger has ever handed out across *all* channels,
 * which is committed and later promoted byte-for-byte.
 *
 * The allocated version is authoritative. Bump computation still runs first —
 * it is what decides whether the allocation is a patch, minor or major step —
 * but the ledger, not the working tree, decides the number that is actually
 * used, because only the ledger knows about versions allocated by a concurrent
 * or already-abandoned release.
 *
 * Refusing a non-forward allocation here is deliberate: silently accepting one
 * would republish over an immutable version, which is the single thing the
 * ledger exists to prevent.
 */
export function applyAllocatedVersion(
  packages: PackageVersion[],
  allocatedVersion: string,
): PackageVersion[] {
  if (!semver.valid(allocatedVersion)) {
    throw new Error(`applyAllocatedVersion: ${allocatedVersion} is not a valid SemVer version`);
  }
  for (const pkg of packages) {
    if (semver.valid(pkg.currentVersion) && !semver.gt(allocatedVersion, pkg.currentVersion)) {
      throw new Error(
        `Allocated release version ${allocatedVersion} is not ahead of ${pkg.name}@${pkg.currentVersion}. ` +
        'The ledger baseline is stale — recompute the version proposal.',
      );
    }
  }
  return packages.map(pkg => ({
    ...pkg,
    nextVersion: allocatedVersion,
    bump: detectAllocatedBump(pkg.currentVersion, allocatedVersion),
    versionPinned: true,
  }));
}

function detectAllocatedBump(from: string, to: string): VersionBump {
  const diff = semver.valid(from) && semver.valid(to) ? semver.diff(from, to) : null;
  if (diff === 'major' || diff === 'premajor') { return 'major'; }
  if (diff === 'minor' || diff === 'preminor') { return 'minor'; }
  return 'patch';
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
