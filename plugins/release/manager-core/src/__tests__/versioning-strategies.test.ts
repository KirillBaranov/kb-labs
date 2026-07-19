import { describe, it, expect } from 'vitest';
import { applyVersionStrategy, applyCanarySuffix } from '../versioning-strategies';
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

describe('applyCanarySuffix', () => {
  it('suffixes the already-computed nextVersion with -canary.<shortsha>', () => {
    const packages = [pkg({ nextVersion: '1.1.0' })];
    const result = applyCanarySuffix(packages, 'abc1234');
    expect(result[0]!.nextVersion).toBe('1.1.0-canary.abc1234');
  });

  it('applies the suffix independently for patch/minor/major base versions', () => {
    const packages = [
      pkg({ name: 'a', nextVersion: '1.0.1' }),
      pkg({ name: 'b', nextVersion: '1.1.0' }),
      pkg({ name: 'c', nextVersion: '2.0.0' }),
    ];
    const result = applyCanarySuffix(packages, 'deadbee');
    expect(result.map(p => p.nextVersion)).toEqual([
      '1.0.1-canary.deadbee',
      '1.1.0-canary.deadbee',
      '2.0.0-canary.deadbee',
    ]);
  });

  it('applies the same suffix to all packages after lockstep resolves a shared base version', () => {
    const packages = [
      pkg({ name: 'a', currentVersion: '1.0.0', nextVersion: '1.0.0', bump: 'minor' }),
      pkg({ name: 'b', currentVersion: '1.0.0', nextVersion: '1.0.0', bump: 'major' }),
    ];
    const lockstepped = applyVersionStrategy(packages, { strategy: 'lockstep' });
    const canaried = applyCanarySuffix(lockstepped, 'ffaa001');
    expect(canaried[0]!.nextVersion).toBe(canaried[1]!.nextVersion);
    expect(canaried[0]!.nextVersion).toBe('2.0.0-canary.ffaa001');
  });

  it('is idempotent-shaped: re-suffixing the same base version with the same SHA reproduces the same output', () => {
    const first = applyCanarySuffix([pkg({ nextVersion: '1.2.3' })], 'aaa1111');
    const second = applyCanarySuffix([pkg({ nextVersion: '1.2.3' })], 'aaa1111');
    expect(first[0]!.nextVersion).toBe(second[0]!.nextVersion);
  });

  it('throws when shortSha is empty', () => {
    expect(() => applyCanarySuffix([pkg({})], '')).toThrow();
  });
});
