import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { EventEmitter } from 'node:events';

const capturedNpmrc: string[] = [];
const capturedArgs: string[][] = [];

vi.mock('node:child_process', () => ({
  spawn: vi.fn((_command: string, args: string[], options: { cwd: string }) => {
    const child = new EventEmitter() as EventEmitter & { stdout: EventEmitter; stderr: EventEmitter };
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();

    capturedArgs.push(args);

    // Capture the temp .npmrc content synchronously, before it's restored/removed.
    const npmrcPath = join(options.cwd, '.npmrc');
    try {
      capturedNpmrc.push(readFileSync(npmrcPath, 'utf-8'));
    } catch {
      capturedNpmrc.push('');
    }

    queueMicrotask(() => child.emit('close', 0));
    return child;
  }),
}));

import { publishPackagesProgrammatic } from '../publish-programmatic';

function makePackageDir(): string {
  const dir = join(tmpdir(), `publish-programmatic-test-${randomBytes(4).toString('hex')}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: '@kb-labs/fixture', version: '1.0.0' }));
  return dir;
}

describe('publishPackagesProgrammatic — .npmrc registry auth', () => {
  let pkgDir: string;

  beforeEach(() => {
    pkgDir = makePackageDir();
    capturedNpmrc.length = 0;
    capturedArgs.length = 0;
  });

  afterEach(() => {
    rmSync(pkgDir, { recursive: true, force: true });
  });

  it('writes the auth token line scoped to the target registry, not registry.npmjs.org', async () => {
    await publishPackagesProgrammatic({
      packages: [{ name: '@kb-labs/fixture', version: '1.0.0', path: pkgDir }],
      registry: 'http://localhost:4873',
      token: 'verdaccio-token',
    });

    expect(capturedNpmrc).toHaveLength(1);
    expect(capturedNpmrc[0]).toContain('//localhost:4873/:_authToken=${NODE_AUTH_TOKEN}');
    expect(capturedNpmrc[0]).not.toContain('registry.npmjs.org');
  });

  it('defaults to registry.npmjs.org when no registry is passed', async () => {
    await publishPackagesProgrammatic({
      packages: [{ name: '@kb-labs/fixture', version: '1.0.0', path: pkgDir }],
      token: 'npm-token',
    });

    expect(capturedNpmrc).toHaveLength(1);
    expect(capturedNpmrc[0]).toContain('//registry.npmjs.org/:_authToken=${NODE_AUTH_TOKEN}');
  });
});

describe('publishPackagesProgrammatic — tarballPath (release deliver)', () => {
  let pkgDir: string;

  beforeEach(() => {
    pkgDir = makePackageDir();
    capturedNpmrc.length = 0;
    capturedArgs.length = 0;
  });

  afterEach(() => {
    rmSync(pkgDir, { recursive: true, force: true });
  });

  it('publishes the tarball path directly instead of packing the directory fresh', async () => {
    const tarballPath = join(pkgDir, 'kb-labs-fixture-1.0.0.tgz');
    await publishPackagesProgrammatic({
      packages: [{ name: '@kb-labs/fixture', version: '1.0.0', path: pkgDir, tarballPath }],
      packageManager: 'npm',
      token: 'npm-token',
    });

    expect(capturedArgs).toHaveLength(1);
    expect(capturedArgs[0]).toEqual(['publish', tarballPath]);
  });

  it('omits --no-git-checks for a tarball publish even under pnpm — there is no working tree to check', async () => {
    const tarballPath = join(pkgDir, 'kb-labs-fixture-1.0.0.tgz');
    await publishPackagesProgrammatic({
      packages: [{ name: '@kb-labs/fixture', version: '1.0.0', path: pkgDir, tarballPath }],
      packageManager: 'pnpm',
      token: 'npm-token',
    });

    expect(capturedArgs[0]).not.toContain('--no-git-checks');
  });

  it('without tarballPath, still packs+publishes from the directory as before', async () => {
    await publishPackagesProgrammatic({
      packages: [{ name: '@kb-labs/fixture', version: '1.0.0', path: pkgDir }],
      packageManager: 'pnpm',
      token: 'npm-token',
    });

    expect(capturedArgs[0]).toEqual(['publish', '--no-git-checks']);
  });
});
