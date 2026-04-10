import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildReverseDependencyGraph } from '../../src/core/dependency-graph.js';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
  readFileSync: vi.fn(),
}));

import { existsSync, readdirSync, readFileSync } from 'node:fs';

const mockExistsSync = vi.mocked(existsSync);
const mockReaddirSync = vi.mocked(readdirSync);
const mockReadFileSync = vi.mocked(readFileSync);

function mockDirEntry(name: string): any {
  return { name, isDirectory: () => true };
}

describe('buildReverseDependencyGraph', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds forward and reverse edges', () => {
    // Setup: workspace with 2 sub-repos, each with 1 package
    mockExistsSync.mockImplementation((p: any) => {
      const s = String(p);
      if (s.endsWith('.gitmodules') || s.endsWith('kb.config.json')) {return s.includes('/root/');}
      if (s.endsWith('platform') || s.endsWith('plugins')) {return true;}
      if (s.includes('packages')) {return true;}
      if (s.endsWith('.git') || s.endsWith('package.json')) {return true;}
      return false;
    });

    mockReaddirSync.mockImplementation((p: any) => {
      const s = String(p);
      if (s.endsWith('/root/platform')) {return [mockDirEntry('repo-a')] as any;}
      if (s.endsWith('/root/plugins')) {return [mockDirEntry('repo-b')] as any;}
      if (s.endsWith('repo-a/packages')) {return [mockDirEntry('pkg-a')] as any;}
      if (s.endsWith('repo-b/packages')) {return [mockDirEntry('pkg-b')] as any;}
      return [] as any;
    });

    mockReadFileSync.mockImplementation((p: any) => {
      const s = String(p);
      if (s.endsWith('.gitmodules')) {
        return [
          '[submodule "repo-a"]',
          '\tpath = platform/repo-a',
          '\turl = https://github.com/test/repo-a.git',
          '[submodule "repo-b"]',
          '\tpath = plugins/repo-b',
          '\turl = https://github.com/test/repo-b.git',
        ].join('\n');
      }
      if (s.includes('pkg-a/package.json')) {
        return JSON.stringify({ name: '@kb-labs/pkg-a', dependencies: {} });
      }
      if (s.includes('pkg-b/package.json')) {
        return JSON.stringify({ name: '@kb-labs/pkg-b', dependencies: { '@kb-labs/pkg-a': 'workspace:*' } });
      }
      return '{}';
    });

    const graph = buildReverseDependencyGraph('/root');

    expect(graph.size).toBe(2);

    const nodeA = graph.get('@kb-labs/pkg-a')!;
    expect(nodeA.dependsOn).toEqual([]);
    expect(nodeA.dependedBy).toEqual(['@kb-labs/pkg-b']);

    const nodeB = graph.get('@kb-labs/pkg-b')!;
    expect(nodeB.dependsOn).toEqual(['@kb-labs/pkg-a']);
    expect(nodeB.dependedBy).toEqual([]);
  });
});
