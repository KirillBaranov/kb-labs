/**
 * Executors for the check groups the plugin evaluates itself (PR 4 item 4).
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  bindCheckExecutors,
  branchCleanTagIntentCheck,
  lockfileToolchainCheck,
  migrationRollbackCheck,
} from '../control-plane/index.js';

const roots: string[] = [];

function repo(): string {
  const root = mkdtempSync(join(tmpdir(), 'kb-release-checks-'));
  roots.push(root);
  execFileSync('git', ['init', '--initial-branch', 'master'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'fixture@kb-labs.test'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'Fixture'], { cwd: root });
  writeFileSync(join(root, 'package.json'), JSON.stringify({ private: true, packageManager: 'pnpm@11.4.0' }));
  writeFileSync(join(root, 'pnpm-lock.yaml'), "lockfileVersion: '9.0'\n");
  execFileSync('git', ['add', '--all'], { cwd: root });
  execFileSync('git', ['commit', '--no-verify', '-m', 'init'], { cwd: root });
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) { rmSync(root, { recursive: true, force: true }); }
});

function ctx(repoRoot: string) {
  return { repoRoot, flow: 'platform', channel: 'canary' as const, candidateId: 'c1' };
}

describe('branch / clean tree / tag / intent binding', () => {
  it('passes on a clean master with a bound intent', () => {
    const root = repo();
    const outcome = branchCleanTagIntentCheck({ intentSha256: 'a'.repeat(64) })(ctx(root));
    expect(outcome.ok).toBe(true);
    expect(outcome.evidenceRef).toMatch(/^[a-f0-9]{40}$/);
  });

  it('fails on a dirty tree — the release would not be reproducible from any commit', () => {
    const root = repo();
    writeFileSync(join(root, 'stray.txt'), 'uncommitted\n');
    const outcome = branchCleanTagIntentCheck({ intentSha256: 'a'.repeat(64) })(ctx(root));
    expect(outcome.ok).toBe(false);
    expect(outcome.diagnostics.map(d => d.code)).toContain('KB_RELEASE_CHECK_DIRTY_TREE');
  });

  it('fails on the wrong branch', () => {
    const root = repo();
    execFileSync('git', ['checkout', '-q', '-b', 'feature'], { cwd: root });
    const outcome = branchCleanTagIntentCheck({ intentSha256: 'a'.repeat(64) })(ctx(root));
    expect(outcome.diagnostics.map(d => d.code)).toContain('KB_RELEASE_CHECK_BRANCH');
  });

  // A taken tag means the version was already allocated, and §3 forbids reuse.
  it('fails when the release tag already exists', () => {
    const root = repo();
    execFileSync('git', ['tag', 'platform-v2.120.0'], { cwd: root });
    const outcome = branchCleanTagIntentCheck({
      releaseTag: 'platform-v2.120.0', intentSha256: 'a'.repeat(64),
    })(ctx(root));
    expect(outcome.diagnostics.map(d => d.code)).toContain('KB_RELEASE_CHECK_TAG_TAKEN');
  });

  it('fails when the run is not bound to a planned intent', () => {
    const root = repo();
    const outcome = branchCleanTagIntentCheck({})(ctx(root));
    expect(outcome.diagnostics.map(d => d.code)).toContain('KB_RELEASE_CHECK_INTENT_UNBOUND');
  });
});

describe('lockfile / toolchain / dependency direction', () => {
  it('passes a pinned workspace with no outbound workspace dependencies', () => {
    const root = repo();
    expect(lockfileToolchainCheck()(ctx(root)).ok).toBe(true);
  });

  it('fails when the lockfile or the toolchain pin is missing', () => {
    const root = repo();
    rmSync(join(root, 'pnpm-lock.yaml'));
    writeFileSync(join(root, 'package.json'), JSON.stringify({ private: true }));
    const codes = lockfileToolchainCheck()(ctx(root)).diagnostics.map(d => d.code);
    expect(codes).toContain('KB_RELEASE_CHECK_LOCKFILE_MISSING');
    expect(codes).toContain('KB_RELEASE_CHECK_TOOLCHAIN_UNPINNED');
  });

  // The published package would carry a `workspace:` specifier no consumer can
  // resolve, because the dependency never leaves the monorepo.
  it('fails when a released package depends on a workspace package outside the release set', () => {
    const root = repo();
    mkdirSync(join(root, 'packages/a'), { recursive: true });
    writeFileSync(join(root, 'packages/a/package.json'), JSON.stringify({
      name: '@kb/a', dependencies: { '@kb/internal': 'workspace:*' },
    }));
    const outcome = lockfileToolchainCheck({
      releasedPackages: [{ name: '@kb/a', path: join(root, 'packages/a') }],
    })(ctx(root));
    expect(outcome.ok).toBe(false);
    expect(outcome.diagnostics[0]!.code).toBe('KB_RELEASE_CHECK_DEPENDENCY_DIRECTION');
  });

  it('accepts a workspace dependency that is itself in the release set', () => {
    const root = repo();
    for (const name of ['a', 'b']) {
      mkdirSync(join(root, `packages/${name}`), { recursive: true });
    }
    writeFileSync(join(root, 'packages/a/package.json'), JSON.stringify({
      name: '@kb/a', dependencies: { '@kb/b': 'workspace:*' },
    }));
    writeFileSync(join(root, 'packages/b/package.json'), JSON.stringify({ name: '@kb/b' }));
    const outcome = lockfileToolchainCheck({
      releasedPackages: [
        { name: '@kb/a', path: join(root, 'packages/a') },
        { name: '@kb/b', path: join(root, 'packages/b') },
      ],
    })(ctx(root));
    expect(outcome.ok).toBe(true);
  });
});

describe('migration rollback class and downgrade validation', () => {
  function writeManifest(root: string, version: string, migrations: unknown[]): void {
    const dir = join(root, '.kb', 'release', 'migrations');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${version}.json`), JSON.stringify({ migrations }));
  }

  it('passes when the release declares no migrations at all', () => {
    const root = repo();
    const outcome = migrationRollbackCheck({ version: '2.120.0', previousStableVersion: '2.119.0' })(ctx(root));
    expect(outcome.ok).toBe(true);
    expect(outcome.diagnostics[0]!.code).toBe('KB_RELEASE_CHECK_NO_MIGRATIONS');
  });

  // The stable rollback boundary (§3C) is computed from these declarations, so
  // an undeclared class is a failure rather than an optimistic default.
  it('fails on a migration with no declared rollback class', () => {
    const root = repo();
    writeManifest(root, '2.120.0', [{ id: 'add-column' }]);
    const outcome = migrationRollbackCheck({ version: '2.120.0', previousStableVersion: '2.119.0' })(ctx(root));
    expect(outcome.ok).toBe(false);
    expect(outcome.diagnostics[0]!.code).toBe('KB_RELEASE_CHECK_ROLLBACK_CLASS_UNDECLARED');
  });

  it('accepts a forward-only migration without a downgrade target', () => {
    const root = repo();
    writeManifest(root, '2.120.0', [{ id: 'drop-table', rollbackClass: 'forward-only' }]);
    expect(migrationRollbackCheck({ version: '2.120.0', previousStableVersion: '2.119.0' })(ctx(root)).ok).toBe(true);
  });

  it('requires a reachable downgrade target for a reversible migration', () => {
    const root = repo();
    writeManifest(root, '2.120.0', [{ id: 'add-column', rollbackClass: 'reversible' }]);
    expect(migrationRollbackCheck({ version: '2.120.0', previousStableVersion: '2.119.0' })(ctx(root))
      .diagnostics[0]!.code).toBe('KB_RELEASE_CHECK_DOWNGRADE_TARGET_MISSING');

    writeManifest(root, '2.120.0', [{ id: 'add-column', rollbackClass: 'reversible', downgradeTo: '2.119.5' }]);
    expect(migrationRollbackCheck({ version: '2.120.0', previousStableVersion: '2.119.0' })(ctx(root))
      .diagnostics[0]!.code).toBe('KB_RELEASE_CHECK_DOWNGRADE_UNREACHABLE');

    writeManifest(root, '2.120.0', [{ id: 'add-column', rollbackClass: 'reversible', downgradeTo: '2.119.0' }]);
    expect(migrationRollbackCheck({ version: '2.120.0', previousStableVersion: '2.119.0' })(ctx(root)).ok).toBe(true);
  });

  it('fails a reversible migration when there is no previous stable to roll back to', () => {
    const root = repo();
    writeManifest(root, '2.120.0', [{ id: 'add-column', rollbackClass: 'reversible', downgradeTo: '2.119.0' }]);
    expect(migrationRollbackCheck({ version: '2.120.0', previousStableVersion: null })(ctx(root))
      .diagnostics[0]!.code).toBe('KB_RELEASE_CHECK_NO_PREVIOUS_STABLE');
  });
});

describe('executor binding', () => {
  it('binds the locally evaluable groups and leaves the CI/kb-create ones unimplemented', () => {
    const bound = bindCheckExecutors({ intentSha256: 'a'.repeat(64), version: '2.120.0' });
    const byId = new Map(bound.map(check => [check.id, check]));

    for (const id of [
      'source.branch-clean-tag-intent',
      'source.lockfile-toolchain-dependency-direction',
      'source.migration-rollback-class-downgrade',
      'artifact.package-manifest-publishability',
      'artifact.checksums-inventory-graph',
    ]) {
      expect(byId.get(id)!.run, id).toBeTypeOf('function');
    }

    // Their evidence is produced by CI (PR 6) and kb-create (PR 7).
    expect(byId.get('delivery.registry-propagation')!.run).toBeUndefined();
    expect(byId.get('post-delivery.fresh-install-update-rollback')!.run).toBeUndefined();
  });

  it('leaves the config-driven groups unbound unless a runner is supplied', () => {
    const unbound = bindCheckExecutors({});
    expect(unbound.find(c => c.id === 'source.build-lint-typecheck-unit')!.run).toBeUndefined();

    const bound = bindCheckExecutors({
      runConfiguredChecks: async () => ({ ok: true, diagnostics: [] }),
    });
    expect(bound.find(c => c.id === 'source.pack-clean-install')!.run).toBeTypeOf('function');
  });

  it('reports an artifact check as failed when no sealed bundle was supplied', async () => {
    const bound = bindCheckExecutors({});
    const outcome = await bound.find(c => c.id === 'artifact.checksums-inventory-graph')!.run!(ctx(repo()));
    expect(outcome.ok).toBe(false);
    expect(outcome.diagnostics[0]!.code).toBe('KB_RELEASE_CHECK_NO_BUNDLE');
  });
});
