import { describe, it, expect } from 'vitest';
import { computeBuildLayers, sortByBuildLayers } from '../src/runner/build-order.js';
import type { WorkspacePackage } from '@kb-labs/qa-contracts';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

function createTempPackages(
  packages: Array<{ name: string; deps?: Record<string, string>; devDeps?: Record<string, string> }>,
): WorkspacePackage[] {
  const rootDir = join(tmpdir(), `build-order-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(rootDir, { recursive: true });

  const result: WorkspacePackage[] = [];
  for (const pkg of packages) {
    const pkgDir = join(rootDir, pkg.name.replace(/[@/]/g, '-'));
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(join(pkgDir, 'package.json'), JSON.stringify({
      name: pkg.name,
      version: '1.0.0',
      dependencies: pkg.deps ?? {},
      devDependencies: pkg.devDeps ?? {},
    }));
    result.push({
      name: pkg.name,
      dir: pkgDir,
      relativePath: pkg.name.replace(/[@/]/g, '-'),
      repo: 'test-repo',
    });
  }

  return result;
}

describe('computeBuildLayers', () => {
  it('returns empty array for empty input', () => {
    expect(computeBuildLayers([])).toEqual([]);
  });

  it('puts all packages in layer 0 when no workspace deps', () => {
    const packages = createTempPackages([
      { name: 'a', deps: { lodash: '^4.0.0' } },
      { name: 'b', deps: { zod: '^3.0.0' } },
      { name: 'c' },
    ]);

    const layers = computeBuildLayers(packages);
    expect(layers).toHaveLength(1);
    expect(layers[0].index).toBe(0);
    expect(layers[0].packages.map(p => p.name).sort()).toEqual(['a', 'b', 'c']);
  });

  it('sorts linear dependency chain into layers', () => {
    const packages = createTempPackages([
      { name: 'c', deps: { b: 'workspace:*' } },
      { name: 'b', deps: { a: 'workspace:*' } },
      { name: 'a' },
    ]);

    const layers = computeBuildLayers(packages);
    expect(layers).toHaveLength(3);
    expect(layers[0].packages.map(p => p.name)).toEqual(['a']);
    expect(layers[1].packages.map(p => p.name)).toEqual(['b']);
    expect(layers[2].packages.map(p => p.name)).toEqual(['c']);
  });

  it('groups independent packages in same layer', () => {
    const packages = createTempPackages([
      { name: 'app', deps: { lib1: 'workspace:*', lib2: 'workspace:*' } },
      { name: 'lib1', deps: { core: 'workspace:*' } },
      { name: 'lib2', deps: { core: 'workspace:*' } },
      { name: 'core' },
    ]);

    const layers = computeBuildLayers(packages);
    expect(layers).toHaveLength(3);
    expect(layers[0].packages.map(p => p.name)).toEqual(['core']);
    expect(layers[1].packages.map(p => p.name).sort()).toEqual(['lib1', 'lib2']);
    expect(layers[2].packages.map(p => p.name)).toEqual(['app']);
  });

  it('handles devDependencies', () => {
    const packages = createTempPackages([
      { name: 'app', devDeps: { testing: 'workspace:*' } },
      { name: 'testing' },
    ]);

    const layers = computeBuildLayers(packages);
    expect(layers).toHaveLength(2);
    expect(layers[0].packages.map(p => p.name)).toEqual(['testing']);
    expect(layers[1].packages.map(p => p.name)).toEqual(['app']);
  });

  it('ignores external (non-workspace) dependencies', () => {
    const packages = createTempPackages([
      { name: 'a', deps: { lodash: '^4.0.0', zod: '^3.0.0' } },
      { name: 'b', deps: { express: '^4.0.0' } },
    ]);

    const layers = computeBuildLayers(packages);
    expect(layers).toHaveLength(1);
    expect(layers[0].packages).toHaveLength(2);
  });

  it('handles circular dependencies by appending as last layer', () => {
    const packages = createTempPackages([
      { name: 'a', deps: { b: 'workspace:*' } },
      { name: 'b', deps: { a: 'workspace:*' } },
      { name: 'c' },
    ]);

    const layers = computeBuildLayers(packages);
    expect(layers.length).toBeGreaterThanOrEqual(2);
    expect(layers[0].packages.map(p => p.name)).toEqual(['c']);
    const lastLayer = layers[layers.length - 1];
    expect(lastLayer.packages.map(p => p.name).sort()).toEqual(['a', 'b']);
  });

  it('handles diamond dependency pattern', () => {
    const packages = createTempPackages([
      { name: 'd', deps: { b: '*', c: '*' } },
      { name: 'b', deps: { a: '*' } },
      { name: 'c', deps: { a: '*' } },
      { name: 'a' },
    ]);

    const layers = computeBuildLayers(packages);
    expect(layers).toHaveLength(3);
    expect(layers[0].packages.map(p => p.name)).toEqual(['a']);
    expect(layers[1].packages.map(p => p.name).sort()).toEqual(['b', 'c']);
    expect(layers[2].packages.map(p => p.name)).toEqual(['d']);
  });

  it('handles single package', () => {
    const packages = createTempPackages([{ name: 'solo' }]);
    const layers = computeBuildLayers(packages);
    expect(layers).toHaveLength(1);
    expect(layers[0].packages.map(p => p.name)).toEqual(['solo']);
  });
});

describe('sortByBuildLayers', () => {
  it('returns packages in dependency order', () => {
    const packages = createTempPackages([
      { name: 'c', deps: { b: '*' } },
      { name: 'a' },
      { name: 'b', deps: { a: '*' } },
    ]);

    const sorted = sortByBuildLayers(packages);
    const names = sorted.map(p => p.name);
    expect(names.indexOf('a')).toBeLessThan(names.indexOf('b'));
    expect(names.indexOf('b')).toBeLessThan(names.indexOf('c'));
  });

  it('returns empty array for empty input', () => {
    expect(sortByBuildLayers([])).toEqual([]);
  });

  it('preserves all packages', () => {
    const packages = createTempPackages([
      { name: 'x', deps: { y: '*' } },
      { name: 'y' },
      { name: 'z' },
    ]);

    const sorted = sortByBuildLayers(packages);
    expect(sorted).toHaveLength(3);
    expect(sorted.map(p => p.name).sort()).toEqual(['x', 'y', 'z']);
  });
});
