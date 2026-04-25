import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { rewriteWorkspaceDeps } from '../dep-rewrite';

function makeRoot(): string {
  const root = join(tmpdir(), `dep-test-${randomBytes(4).toString('hex')}`);
  mkdirSync(root, { recursive: true });
  return root;
}

function writePkg(dir: string, content: object): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify(content, null, 2) + '\n');
}

function readPkg(dir: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf-8'));
}

describe('rewriteWorkspaceDeps', () => {
  let root: string;

  beforeEach(() => { root = makeRoot(); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it('rewrites workspace:* to ^version for non-pnpm', () => {
    writePkg(root, {
      name: '@scope/alpha',
      dependencies: { '@scope/beta': 'workspace:*' },
    });
    const versionMap = new Map([['@scope/beta', '2.0.0']]);
    const restore = rewriteWorkspaceDeps(root, versionMap, 'npm');

    const pkg = readPkg(root);
    expect((pkg.dependencies as any)['@scope/beta']).toBe('^2.0.0');

    restore();
    const restored = readPkg(root);
    expect((restored.dependencies as any)['@scope/beta']).toBe('workspace:*');
  });

  it('does NOT rewrite workspace:* for pnpm (handled natively)', () => {
    writePkg(root, {
      name: '@scope/alpha',
      dependencies: { '@scope/beta': 'workspace:*' },
    });
    const versionMap = new Map([['@scope/beta', '2.0.0']]);
    const restore = rewriteWorkspaceDeps(root, versionMap, 'pnpm');

    expect((readPkg(root).dependencies as any)['@scope/beta']).toBe('workspace:*');
    restore();
  });

  it('rewrites link: deps regardless of package manager', () => {
    const linkedDir = join(root, 'linked');
    writePkg(linkedDir, { name: '@scope/linked', version: '1.2.3' });

    const pkgDir = join(root, 'main');
    writePkg(pkgDir, {
      name: '@scope/main',
      dependencies: { '@scope/linked': 'link:../linked' },
    });

    const versionMap = new Map<string, string>();
    const restore = rewriteWorkspaceDeps(pkgDir, versionMap, 'pnpm');

    const pkg = readPkg(pkgDir);
    expect((pkg.dependencies as any)['@scope/linked']).toBe('^1.2.3');

    restore();
    expect((readPkg(pkgDir).dependencies as any)['@scope/linked']).toBe('link:../linked');
  });

  it('uses versionMap to rewrite link: when available', () => {
    const pkgDir = join(root, 'main');
    writePkg(pkgDir, {
      name: '@scope/main',
      dependencies: { '@scope/linked': 'link:../linked' },
    });

    const versionMap = new Map([['@scope/linked', '3.0.0']]);
    const restore = rewriteWorkspaceDeps(pkgDir, versionMap, 'npm');

    expect((readPkg(pkgDir).dependencies as any)['@scope/linked']).toBe('^3.0.0');
    restore();
  });

  it('rewrites peerDependencies as well as dependencies', () => {
    writePkg(root, {
      name: '@scope/alpha',
      dependencies: { '@scope/a': 'workspace:*' },
      peerDependencies: { '@scope/b': 'workspace:*' },
    });
    const versionMap = new Map([['@scope/a', '1.0.0'], ['@scope/b', '2.0.0']]);
    const restore = rewriteWorkspaceDeps(root, versionMap, 'npm');

    const pkg = readPkg(root);
    expect((pkg.dependencies as any)['@scope/a']).toBe('^1.0.0');
    expect((pkg.peerDependencies as any)['@scope/b']).toBe('^2.0.0');

    restore();
  });

  it('restore returns original content verbatim', () => {
    const original = JSON.stringify({ name: '@scope/a', dependencies: { '@scope/b': 'workspace:*' } }, null, 2) + '\n';
    writeFileSync(join(root, 'package.json'), original);

    const versionMap = new Map([['@scope/b', '1.0.0']]);
    const restore = rewriteWorkspaceDeps(root, versionMap, 'npm');
    restore();

    expect(readFileSync(join(root, 'package.json'), 'utf-8')).toBe(original);
  });
});
