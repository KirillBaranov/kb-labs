import { describe, it, expect, vi, beforeEach } from 'vitest';
import { analyzeTestImpact } from '../../src/core/test-analyzer.js';
import type { PackageImpact } from '@kb-labs/impact-contracts';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
  readFileSync: vi.fn(),
}));

import { existsSync, readdirSync, readFileSync } from 'node:fs';

const mockExistsSync = vi.mocked(existsSync);
const mockReaddirSync = vi.mocked(readdirSync);
const mockReadFileSync = vi.mocked(readFileSync);

function mockDirEntry(name: string, isDir = true): any {
  return { name, isDirectory: () => isDir };
}

function mockFileEntry(name: string): any {
  return { name, isDirectory: () => false };
}

describe('analyzeTestImpact', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('detects packages with tests → mustRun', () => {
    mockExistsSync.mockImplementation((p: any) => {
      const s = String(p);
      // workspace root markers
      if (s.endsWith('.gitmodules') || s.endsWith('kb.config.json')) {return s.includes('/root/');}
      // repo structure
      if (s.endsWith('/root/platform')) {return true;}
      if (s.includes('repo-a/packages')) {return true;}
      if (s.includes('pkg-a')) {return true;}
      if (s.endsWith('.git') || s.endsWith('package.json')) {return true;}
      // test dir exists for pkg-a
      if (s.includes('pkg-a/tests')) {return true;}
      return false;
    });

    mockReaddirSync.mockImplementation((p: any) => {
      const s = String(p);
      if (s.endsWith('/root/platform')) {return [mockDirEntry('repo-a')] as any;}
      if (s.endsWith('repo-a/packages')) {return [mockDirEntry('pkg-a')] as any;}
      // test files in tests/
      if (s.includes('pkg-a/tests')) {return [mockFileEntry('foo.test.ts'), mockFileEntry('bar.spec.ts')] as any;}
      return [] as any;
    });

    mockReadFileSync.mockImplementation((p: any) => {
      if (String(p).includes('pkg-a/package.json')) {
        return JSON.stringify({ name: '@kb-labs/pkg-a' });
      }
      return '{}';
    });

    const impacted: PackageImpact[] = [
      { name: '@kb-labs/pkg-a', repo: 'platform/repo-a', level: 'direct', changedFiles: 2 },
    ];

    const result = analyzeTestImpact(impacted, '/root');

    expect(result.mustRun).toHaveLength(1);
    expect(result.mustRun[0].name).toBe('@kb-labs/pkg-a');
    expect(result.mustRun[0].hasTests).toBe(true);
    expect(result.mustRun[0].testCount).toBe(2);
    expect(result.mustRun[0].command).toBe('pnpm --filter @kb-labs/pkg-a run test');
    expect(result.noTests).toHaveLength(0);
  });

  it('detects packages without tests → noTests', () => {
    mockExistsSync.mockImplementation((p: any) => {
      const s = String(p);
      if (s.endsWith('.gitmodules') || s.endsWith('kb.config.json')) {return s.includes('/root/');}
      if (s.endsWith('/root/platform')) {return true;}
      if (s.includes('repo-b/packages')) {return true;}
      if (s.includes('pkg-b')) {return true;}
      if (s.endsWith('.git') || s.endsWith('package.json')) {return true;}
      // NO test dirs
      return false;
    });

    mockReaddirSync.mockImplementation((p: any) => {
      const s = String(p);
      if (s.endsWith('/root/platform')) {return [mockDirEntry('repo-b')] as any;}
      if (s.endsWith('repo-b/packages')) {return [mockDirEntry('pkg-b')] as any;}
      return [] as any;
    });

    mockReadFileSync.mockImplementation((p: any) => {
      if (String(p).includes('pkg-b/package.json')) {
        return JSON.stringify({ name: '@kb-labs/pkg-b' });
      }
      return '{}';
    });

    const impacted: PackageImpact[] = [
      { name: '@kb-labs/pkg-b', repo: 'platform/repo-b', level: 'dependent', reason: 'depends on something' },
    ];

    const result = analyzeTestImpact(impacted, '/root');

    expect(result.mustRun).toHaveLength(0);
    expect(result.noTests).toHaveLength(1);
    expect(result.noTests[0].name).toBe('@kb-labs/pkg-b');
    expect(result.noTests[0].hasTests).toBe(false);
    expect(result.noTests[0].command).toBeUndefined();
  });
});
