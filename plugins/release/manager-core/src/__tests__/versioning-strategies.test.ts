import { describe, it, expect } from 'vitest';
import { applyVersionStrategy, applyAllocatedVersion } from '../versioning-strategies';
import type { PackageVersion } from '../types';

function pkg(overrides: Partial<PackageVersion>): PackageVersion {
  return {
    name: '@kb-labs/fixture',
    path: '/tmp/fixture',
    gitRoot: '/tmp',
    currentVersion: '1.0.0',
    nextVersion: '1.0.0',
    bump: 'patch',
    isPublished: false,
    ...overrides,
  };
}

describe('applyAllocatedVersion', () => {
  it('replaces the computed nextVersion with the version the ledger allocated', () => {
    const result = applyAllocatedVersion([pkg({ currentVersion: '1.0.0', nextVersion: '1.0.1' })], '1.22.33');
    expect(result[0]!.nextVersion).toBe('1.22.33');
  });

  it('produces a final SemVer with no prerelease suffix — canary is promotable byte-for-byte', () => {
    const result = applyAllocatedVersion([pkg({ nextVersion: '1.1.0' })], '1.21.0');
    expect(result[0]!.nextVersion).not.toContain('-canary.');
    expect(result[0]!.nextVersion).not.toContain('-');
  });

  it('collapses every package onto the one allocated version', () => {
    const packages = [
      pkg({ name: 'a', currentVersion: '1.0.0', nextVersion: '1.0.1' }),
      pkg({ name: 'b', currentVersion: '1.0.0', nextVersion: '2.0.0' }),
    ];
    const result = applyAllocatedVersion(packages, '2.1.0');
    expect(result.map(p => p.nextVersion)).toEqual(['2.1.0', '2.1.0']);
  });

  it('marks the version as pinned so lockstep cannot bump on top of the allocation', () => {
    const result = applyAllocatedVersion([pkg({ nextVersion: '1.0.1' })], '1.5.0');
    expect(result[0]!.versionPinned).toBe(true);
    expect(applyVersionStrategy(result, { strategy: 'lockstep' })[0]!.nextVersion).toBe('1.5.0');
  });

  it('reports the bump implied by the allocation rather than the one computed locally', () => {
    expect(applyAllocatedVersion([pkg({ currentVersion: '1.0.0', bump: 'patch' })], '2.0.0')[0]!.bump).toBe('major');
    expect(applyAllocatedVersion([pkg({ currentVersion: '1.0.0', bump: 'patch' })], '1.1.0')[0]!.bump).toBe('minor');
  });

  it('refuses an allocation that is not ahead of a package on disk — republishing an immutable version', () => {
    expect(() => applyAllocatedVersion([pkg({ currentVersion: '2.0.0' })], '1.9.0')).toThrow(/not ahead of/);
    expect(() => applyAllocatedVersion([pkg({ currentVersion: '2.0.0' })], '2.0.0')).toThrow(/not ahead of/);
  });

  it('rejects a non-SemVer allocation', () => {
    expect(() => applyAllocatedVersion([pkg({})], 'latest')).toThrow(/not a valid SemVer/);
  });
});

describe('applyVersionStrategy lockstep — idempotent retry', () => {
  // Reproduces the "tag/commit one version ahead of package.json and npm"
  // bug: on a retry after publish succeeded but the git commit/tag step
  // failed, the planner's per-package idempotent guard (planner.ts) already
  // resolved nextVersion back to the just-published currentVersion and set
  // isPublished: true — that decision must survive lockstep resolution
  // unchanged, not get bumped a second time.
  it('does not re-bump packages already resolved by the idempotent-retry guard', () => {
    const packages = [
      pkg({
        name: '@kb-labs/a',
        currentVersion: '2.114.0',
        nextVersion: '2.114.0',
        bump: 'minor',
        isPublished: true,
      }),
      pkg({
        name: '@kb-labs/b',
        currentVersion: '2.114.0',
        nextVersion: '2.114.0',
        bump: 'minor',
        isPublished: true,
      }),
    ];

    const result = applyVersionStrategy(packages, { strategy: 'lockstep' });

    expect(result.map(p => p.nextVersion)).toEqual(['2.114.0', '2.114.0']);
  });

  // The `release:version` → `release:git` handoff: version bumped
  // package.json on disk, nothing is published yet, and `release:git`
  // re-planned. The planner's trust-disk guard pins nextVersion to the
  // on-disk version, but with isPublished still false. Gating the lockstep
  // guard on isPublished alone let this fall through to a second bump —
  // 2.116.14 → 2.117.0 on disk, tag/commit claiming 2.118.0.
  it('does not re-bump packages pinned to an on-disk bump that is not published yet', () => {
    const packages = [
      pkg({
        name: '@kb-labs/a',
        currentVersion: '2.117.0',
        nextVersion: '2.117.0',
        bump: 'minor',
        isPublished: false,
        versionPinned: true,
      }),
      pkg({
        name: '@kb-labs/b',
        currentVersion: '2.117.0',
        nextVersion: '2.117.0',
        bump: 'minor',
        isPublished: false,
        versionPinned: true,
      }),
    ];

    const result = applyVersionStrategy(packages, { strategy: 'lockstep' });

    expect(result.map(p => p.nextVersion)).toEqual(['2.117.0', '2.117.0']);
  });

  it('pins unresolved packages to the shared resolved version rather than bumping them', () => {
    const packages = [
      pkg({ name: '@kb-labs/a', currentVersion: '2.117.0', nextVersion: '2.117.0', versionPinned: true }),
      pkg({ name: '@kb-labs/b', currentVersion: '2.116.14', nextVersion: '2.117.0', bump: 'minor' }),
    ];

    const result = applyVersionStrategy(packages, { strategy: 'lockstep' });

    expect(result.map(p => p.nextVersion)).toEqual(['2.117.0', '2.117.0']);
  });

  it('fails loudly when already-resolved versions disagree instead of collapsing to the max', () => {
    const packages = [
      pkg({ name: '@kb-labs/a', currentVersion: '2.117.0', nextVersion: '2.117.0', versionPinned: true }),
      pkg({ name: '@kb-labs/b', currentVersion: '2.118.0', nextVersion: '2.118.0', versionPinned: true }),
    ];

    expect(() => applyVersionStrategy(packages, { strategy: 'lockstep' }))
      .toThrow(/conflicting already-resolved versions/);
  });
});
