import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { copyChangelogToPackages } from '../publisher';
import type { PackageVersion, ReleasePlan } from '../types';

function makePkg(overrides: Partial<PackageVersion> & { name: string; path: string }): PackageVersion {
  return {
    gitRoot: '/tmp',
    currentVersion: '1.0.0',
    nextVersion: '1.1.0',
    bump: 'minor',
    isPublished: false,
    ...overrides,
  };
}

describe('copyChangelogToPackages — lockstep releases', () => {
  let root: string;

  beforeEach(() => {
    root = join(tmpdir(), `kb-changelog-test-${randomBytes(4).toString('hex')}`);
    mkdirSync(join(root, 'alpha'), { recursive: true });
    mkdirSync(join(root, 'beta'), { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('writes the full consolidated changelog to every package, not an empty per-package extract', async () => {
    const plan: ReleasePlan = {
      packages: [
        makePkg({ name: '@scope/alpha', path: join(root, 'alpha') }),
        makePkg({ name: '@scope/beta', path: join(root, 'beta') }),
      ],
      strategy: 'semver',
      registry: 'https://registry.npmjs.org',
      rollbackEnabled: true,
      channel: 'stable',
    };

    // Real shape produced by changelog-generator.ts for a lockstep release —
    // a single consolidated header, no per-package sections.
    const lockstepChangelog = [
      '## [1.1.0] - 2026-01-01',
      '',
      '**2 packages** bumped to v1.1.0',
      '',
      '### ✨ New Features',
      '',
      '- **alpha**: does a new thing',
    ].join('\n');

    await copyChangelogToPackages({ cwd: root, plan, changelog: lockstepChangelog });

    const alphaPath = join(root, 'alpha', 'CHANGELOG.md');
    const betaPath = join(root, 'beta', 'CHANGELOG.md');
    expect(existsSync(alphaPath)).toBe(true);
    expect(existsSync(betaPath)).toBe(true);

    const alphaContent = readFileSync(alphaPath, 'utf-8');
    const betaContent = readFileSync(betaPath, 'utf-8');
    expect(alphaContent).toContain('New Features');
    expect(alphaContent).toContain('does a new thing');
    expect(betaContent).toContain('New Features');
  });

  it('replaces the existing version section on re-run instead of duplicating it', async () => {
    const plan: ReleasePlan = {
      packages: [
        makePkg({ name: '@scope/alpha', path: join(root, 'alpha') }),
        makePkg({ name: '@scope/beta', path: join(root, 'beta') }),
      ],
      strategy: 'semver',
      registry: 'https://registry.npmjs.org',
      rollbackEnabled: true,
      channel: 'stable',
    };

    const firstRun = '## [1.1.0] - 2026-01-01\n\nfirst content';
    await copyChangelogToPackages({ cwd: root, plan, changelog: firstRun });

    const secondRun = '## [1.1.0] - 2026-01-01\n\nsecond content (retry)';
    await copyChangelogToPackages({ cwd: root, plan, changelog: secondRun });

    const alphaContent = readFileSync(join(root, 'alpha', 'CHANGELOG.md'), 'utf-8');
    expect(alphaContent).toContain('second content (retry)');
    expect(alphaContent).not.toContain('first content');
    // Only one version-1.1.0 header, not two.
    expect(alphaContent.match(/## \[1\.1\.0\]/g)?.length).toBe(1);
  });

  it('preserves an older version section when a newer lockstep entry is prepended', async () => {
    const plan110: ReleasePlan = {
      packages: [makePkg({ name: '@scope/alpha', path: join(root, 'alpha'), nextVersion: '1.1.0' })],
      strategy: 'semver',
      registry: 'https://registry.npmjs.org',
      rollbackEnabled: true,
      channel: 'stable',
    };
    await copyChangelogToPackages({ cwd: root, plan: plan110, changelog: '## [1.1.0] - 2026-01-01\n\nfirst release' });

    const plan120: ReleasePlan = {
      packages: [
        makePkg({ name: '@scope/alpha', path: join(root, 'alpha'), currentVersion: '1.1.0', nextVersion: '1.2.0' }),
        makePkg({ name: '@scope/beta', path: join(root, 'beta'), currentVersion: '1.1.0', nextVersion: '1.2.0' }),
      ],
      strategy: 'semver',
      registry: 'https://registry.npmjs.org',
      rollbackEnabled: true,
      channel: 'stable',
    };
    await copyChangelogToPackages({ cwd: root, plan: plan120, changelog: '## [1.2.0] - 2026-02-01\n\nsecond release' });

    const alphaContent = readFileSync(join(root, 'alpha', 'CHANGELOG.md'), 'utf-8');
    expect(alphaContent).toContain('second release');
    expect(alphaContent).toContain('first release');
    expect(alphaContent.indexOf('1.2.0')).toBeLessThan(alphaContent.indexOf('1.1.0'));
  });
});
