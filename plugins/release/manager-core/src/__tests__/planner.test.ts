import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { execSync } from 'node:child_process';
import { matchesPackagePattern } from '../planner';
import { planRelease } from '../planner';

// ─── matchesPackagePattern ────────────────────────────────────────────────────

describe('matchesPackagePattern', () => {
  describe('package name patterns', () => {
    it('matches exact name', () => {
      expect(matchesPackagePattern('@kb-labs/devkit', 'infra/kb-labs-devkit', ['@kb-labs/devkit'])).toBe(true);
    });

    it('does not match different name', () => {
      expect(matchesPackagePattern('@kb-labs/core', 'packages/core', ['@kb-labs/devkit'])).toBe(false);
    });

    it('matches wildcard scope pattern', () => {
      expect(matchesPackagePattern('@kb-labs/core', 'packages/core', ['@kb-labs/*'])).toBe(true);
    });

    it('wildcard scope does not match other scope', () => {
      expect(matchesPackagePattern('@my-org/core', 'packages/core', ['@kb-labs/*'])).toBe(false);
    });

    it('matches suffix wildcard', () => {
      expect(matchesPackagePattern('@kb-labs/plugin-template-core', 'packages/plugin-template-core', ['@kb-labs/plugin-template-*'])).toBe(true);
    });

    it('suffix wildcard does not match non-matching name', () => {
      expect(matchesPackagePattern('@kb-labs/plugin-execution', 'packages/plugin-execution', ['@kb-labs/plugin-template-*'])).toBe(false);
    });

    it('matches unscoped package name', () => {
      expect(matchesPackagePattern('my-pkg', 'packages/my-pkg', ['my-pkg'])).toBe(true);
    });
  });

  describe('path patterns', () => {
    it('matches path glob', () => {
      expect(matchesPackagePattern('@kb-labs/core', 'packages/core', ['packages/*'])).toBe(true);
    });

    it('does not match different dir', () => {
      expect(matchesPackagePattern('@kb-labs/core', 'apps/core', ['packages/*'])).toBe(false);
    });

    it('matches nested path', () => {
      expect(matchesPackagePattern('@kb-labs/adapters-fs', 'infra/kb-labs-adapters/packages/adapters-fs', ['infra/kb-labs-adapters/packages/*'])).toBe(true);
    });
  });

  describe('multiple patterns', () => {
    it('returns true if any pattern matches', () => {
      expect(matchesPackagePattern('@kb-labs/devkit', 'infra/devkit', ['@kb-labs/core', '@kb-labs/devkit'])).toBe(true);
    });

    it('returns false if no pattern matches', () => {
      expect(matchesPackagePattern('@kb-labs/other', 'packages/other', ['@kb-labs/core', '@kb-labs/devkit'])).toBe(false);
    });
  });
});

// ─── discoverPackages via planRelease ─────────────────────────────────────────

function makeTmpMonorepo(packages: Array<{ name: string; version?: string; dir?: string }>): string {
  const root = join(tmpdir(), `kb-planner-test-${randomBytes(4).toString('hex')}`);
  mkdirSync(root, { recursive: true });

  // Init git repo so simple-git doesn't throw
  execSync('git init -q', { cwd: root });
  execSync('git config user.email "test@test.com"', { cwd: root });
  execSync('git config user.name "Test"', { cwd: root });
  // Need at least one commit so HEAD exists
  writeFileSync(join(root, '.gitkeep'), '');
  execSync('git add .gitkeep', { cwd: root });
  execSync('git commit -m "init" --allow-empty', { cwd: root });

  // Root package.json without name (workspace manifest)
  writeFileSync(join(root, 'package.json'), JSON.stringify({ private: true }));
  // pnpm-workspace.yaml marker (causes root to be skipped)
  writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - "packages/*"\n');

  for (const pkg of packages) {
    const dir = pkg.dir ?? join('packages', pkg.name.replace(/^@[^/]+\//, ''));
    const pkgDir = join(root, dir);
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(join(pkgDir, 'package.json'), JSON.stringify({
      name: pkg.name,
      version: pkg.version ?? '1.0.0',
    }));
    // Minimal dist so verifier doesn't complain (planner doesn't need it)
  }

  return root;
}

describe('planRelease — packages filter', () => {
  let root: string;

  beforeEach(() => {
    root = makeTmpMonorepo([
      { name: '@scope/alpha' },
      { name: '@scope/beta' },
      { name: '@scope/devkit' },
      { name: '@scope/gamma', dir: 'apps/gamma' },
    ]);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('discovers all non-private packages by default', async () => {
    const plan = await planRelease({ cwd: root, config: {} });
    const names = plan.packages.map(p => p.name).sort();
    expect(names).toContain('@scope/alpha');
    expect(names).toContain('@scope/beta');
    expect(names).toContain('@scope/devkit');
    expect(names).toContain('@scope/gamma');
  });

  it('exclude removes specific package by name', async () => {
    const plan = await planRelease({
      cwd: root,
      config: { packages: { exclude: ['@scope/devkit'] } },
    });
    const names = plan.packages.map(p => p.name);
    expect(names).not.toContain('@scope/devkit');
    expect(names).toContain('@scope/alpha');
  });

  it('exclude supports wildcard', async () => {
    const plan = await planRelease({
      cwd: root,
      config: { packages: { exclude: ['@scope/d*'] } },
    });
    const names = plan.packages.map(p => p.name);
    expect(names).not.toContain('@scope/devkit');
    expect(names).toContain('@scope/alpha');
  });

  it('include restricts to matching packages only', async () => {
    const plan = await planRelease({
      cwd: root,
      config: { packages: { include: ['@scope/alpha', '@scope/beta'] } },
    });
    const names = plan.packages.map(p => p.name).sort();
    expect(names).toEqual(['@scope/alpha', '@scope/beta']);
  });

  it('paths restricts discovery to given dirs', async () => {
    const plan = await planRelease({
      cwd: root,
      config: { packages: { paths: ['packages/*'] } },
    });
    const names = plan.packages.map(p => p.name);
    // apps/gamma should not appear
    expect(names).not.toContain('@scope/gamma');
    expect(names).toContain('@scope/alpha');
  });

  it('per-scope exclude merges with global exclude', async () => {
    // scope here is a wildcard pattern matching package names (e.g. '@scope/*')
    // so all @scope/* packages pass the scope filter, then per-scope packages
    // config for '@scope/*' applies on top of global exclude
    const plan = await planRelease({
      cwd: root,
      config: {
        packages: { exclude: ['@scope/devkit'] },
        scopes: {
          '@scope/*': { packages: { exclude: ['@scope/alpha'] } },
        },
      },
      scope: '@scope/*',
    });
    const names = plan.packages.map(p => p.name);
    expect(names).not.toContain('@scope/devkit'); // global exclude
    expect(names).not.toContain('@scope/alpha');  // scope exclude
    expect(names).toContain('@scope/beta');
  });
});
