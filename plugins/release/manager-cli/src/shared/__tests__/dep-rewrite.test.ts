import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { rewriteWorkspaceDeps } from '../dep-rewrite';

function makeRoot(): string {
  const root = join(tmpdir(), `dep-rewrite-cli-test-${randomBytes(4).toString('hex')}`);
  mkdirSync(root, { recursive: true });
  return root;
}

function writePkg(dir: string, content: object): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify(content, null, 2));
}

describe('rewriteWorkspaceDeps — own version', () => {
  let root: string;

  beforeEach(() => { root = makeRoot(); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it('overwrites the on-disk version with the target publish version (the canary bug)', () => {
    writePkg(root, { name: '@scope/alpha', version: '1.0.0' });

    const restore = rewriteWorkspaceDeps(
      { path: root, version: '1.1.0-canary.abc1234' },
      new Map([['@scope/alpha', '1.1.0-canary.abc1234']]),
      'pnpm',
    );

    const written = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));
    expect(written.version).toBe('1.1.0-canary.abc1234');

    restore();
    const restored = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));
    expect(restored.version).toBe('1.0.0');
  });

  it('is a no-op for the version field when on-disk version already matches (stable path)', () => {
    writePkg(root, { name: '@scope/alpha', version: '1.1.0' });
    const original = readFileSync(join(root, 'package.json'), 'utf-8');

    const restore = rewriteWorkspaceDeps(
      { path: root, version: '1.1.0' },
      new Map([['@scope/alpha', '1.1.0']]),
      'pnpm',
    );

    // No modification needed → file untouched (still readable/equal), restore is safe no-op.
    expect(readFileSync(join(root, 'package.json'), 'utf-8')).toBe(original);
    restore();
    expect(readFileSync(join(root, 'package.json'), 'utf-8')).toBe(original);
  });

  it('still rewrites workspace:/link: deps for non-pnpm package managers alongside the version bump', () => {
    writePkg(root, {
      name: '@scope/alpha',
      version: '1.0.0',
      dependencies: { '@scope/beta': 'workspace:*' },
    });

    const restore = rewriteWorkspaceDeps(
      { path: root, version: '1.1.0-canary.abc1234' },
      new Map([['@scope/alpha', '1.1.0-canary.abc1234'], ['@scope/beta', '2.0.0']]),
      'npm',
    );

    const written = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));
    expect(written.version).toBe('1.1.0-canary.abc1234');
    expect(written.dependencies['@scope/beta']).toBe('^2.0.0');

    restore();
  });

  it('leaves workspace:* deps untouched for pnpm (pnpm handles them natively) while still bumping version', () => {
    writePkg(root, {
      name: '@scope/alpha',
      version: '1.0.0',
      dependencies: { '@scope/beta': 'workspace:*' },
    });

    const restore = rewriteWorkspaceDeps(
      { path: root, version: '1.1.0-canary.abc1234' },
      new Map([['@scope/alpha', '1.1.0-canary.abc1234'], ['@scope/beta', '2.0.0']]),
      'pnpm',
    );

    const written = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));
    expect(written.version).toBe('1.1.0-canary.abc1234');
    expect(written.dependencies['@scope/beta']).toBe('workspace:*');

    restore();
  });
});
