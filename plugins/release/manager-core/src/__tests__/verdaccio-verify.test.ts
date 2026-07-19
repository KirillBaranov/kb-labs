import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  readdirSync: vi.fn(),
  mkdirSync: vi.fn(),
  rmSync: vi.fn(),
}));

vi.mock('../planner', () => ({
  isVersionPublished: vi.fn(),
}));

import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import { isVersionPublished } from '../planner';
import { verifyAgainstRegistry } from '../verdaccio-verify';

const mockSpawnSync = vi.mocked(childProcess.spawnSync);
const mockExistsSync = vi.mocked(fs.existsSync);
const mockReadFileSync = vi.mocked(fs.readFileSync);
const mockReaddirSync = vi.mocked(fs.readdirSync);
const mockIsVersionPublished = vi.mocked(isVersionPublished);

function makePackageJson(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({ name: '@kb-labs/fixture', version: '1.0.0', main: 'dist/index.js', ...overrides });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockExistsSync.mockReturnValue(true);
  mockReaddirSync.mockReturnValue(['fixture-1.0.0.tgz'] as unknown as ReturnType<typeof fs.readdirSync>);
  mockReadFileSync.mockReturnValue(makePackageJson() as unknown as ReturnType<typeof fs.readFileSync>);
  mockSpawnSync.mockReturnValue({ status: 0, stdout: Buffer.from(''), stderr: Buffer.from(''), pid: 1, output: [], signal: null });
});

describe('verifyAgainstRegistry', () => {
  it('fails immediately, without attempting npm pack, when the package is not found on the registry', async () => {
    mockIsVersionPublished.mockResolvedValue(false);

    const results = await verifyAgainstRegistry(
      [{ name: '@kb-labs/fixture', version: '1.0.0', path: '/pkg' }],
      { registry: 'http://localhost:4873' },
    );

    expect(results).toHaveLength(1);
    expect(results[0]!.success).toBe(false);
    expect(results[0]!.issues[0]).toContain('was not found on');
    expect(mockSpawnSync).not.toHaveBeenCalled();
  });

  it('pulls the tarball back via npm pack against the given registry once confirmed published', async () => {
    mockIsVersionPublished.mockResolvedValue(true);

    await verifyAgainstRegistry(
      [{ name: '@kb-labs/fixture', version: '1.0.0', path: '/pkg' }],
      { registry: 'http://localhost:4873', timeout: 5000 },
    );

    const packCall = mockSpawnSync.mock.calls.find(([cmd]) => cmd === 'npm');
    expect(packCall).toBeTruthy();
    expect(packCall![1]).toEqual(expect.arrayContaining(['pack', '@kb-labs/fixture@1.0.0', '--registry', 'http://localhost:4873']));
    expect((packCall![2] as { timeout?: number })?.timeout).toBe(5000);
  });

  it('reports a failure when npm pack cannot retrieve the package from the registry', async () => {
    mockIsVersionPublished.mockResolvedValue(true);
    mockSpawnSync.mockImplementation((cmd: string) => {
      if (cmd === 'npm') {
        return { status: 1, stdout: Buffer.from(''), stderr: Buffer.from('404 Not Found'), pid: 1, output: [], signal: null };
      }
      return { status: 0, stdout: Buffer.from(''), stderr: Buffer.from(''), pid: 1, output: [], signal: null };
    });

    const results = await verifyAgainstRegistry(
      [{ name: '@kb-labs/fixture', version: '1.0.0', path: '/pkg' }],
      { registry: 'http://localhost:4873' },
    );

    expect(results[0]!.success).toBe(false);
    expect(results[0]!.issues[0]).toContain('Could not pull');
  });

  it('re-runs the static tarball checks after pulling the artifact back from the registry', async () => {
    mockIsVersionPublished.mockResolvedValue(true);
    // Simulate a package.json missing its declared `main` entry after extraction.
    mockReadFileSync.mockReturnValue(makePackageJson({ main: 'dist/missing.js' }) as unknown as ReturnType<typeof fs.readFileSync>);
    mockExistsSync.mockImplementation((p: unknown) => !String(p).includes('missing.js'));

    const results = await verifyAgainstRegistry(
      [{ name: '@kb-labs/fixture', version: '1.0.0', path: '/pkg' }],
      { registry: 'http://localhost:4873' },
    );

    expect(results[0]!.success).toBe(false);
    expect(results[0]!.issues.some(i => i.includes('does not exist in published package'))).toBe(true);
  });
});
