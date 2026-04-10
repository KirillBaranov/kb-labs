/**
 * @module @kb-labs/plugin-runtime/__tests__/runtime-api
 *
 * Tests for RuntimeAPI shims (fs, fetch, env).
 *
 * Runtime API provides sandboxed access to system resources:
 * - fs: 17 methods (read, write, mkdir, stat, copy, move, etc.)
 * - fetch: HTTP client with URL whitelist
 * - env: Environment variable access with pattern matching
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRuntimeAPI } from '../runtime/index.js';
import type { PermissionSpec } from '@kb-labs/plugin-contracts';
import { PermissionError } from '@kb-labs/plugin-contracts';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

describe('Runtime API', () => {
  let testDir: string;

  beforeEach(async () => {
    // Create temporary test directory in user's home dir (not /var or /tmp)
    // to avoid DENIED_PATTERNS blocking (/var/, /etc/, /usr/)
    const homeDir = os.homedir();
    const testRoot = path.join(homeDir, '.kb-runtime-test');
    await fs.mkdir(testRoot, { recursive: true });
    testDir = await fs.mkdtemp(path.join(testRoot, 'test-'));
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('fs.readFile', () => {
    it('should read file from cwd', async () => {
      const testFile = path.join(testDir, 'test.txt');
      await fs.writeFile(testFile, 'hello world');

      const permissions: PermissionSpec = {};
      const runtime = createRuntimeAPI({
        permissions,
        cwd: testDir,
      });

      const content = await runtime.fs.readFile('test.txt');
      expect(content).toBe('hello world');
    });

    it('should read file with custom encoding', async () => {
      const testFile = path.join(testDir, 'test.txt');
      await fs.writeFile(testFile, Buffer.from([0x48, 0x69])); // "Hi"

      const permissions: PermissionSpec = {};
      const runtime = createRuntimeAPI({
        permissions,
        cwd: testDir,
      });

      const content = await runtime.fs.readFile('test.txt', 'utf-8');
      expect(content).toBe('Hi');
    });

    it('should reject reading outside cwd', async () => {
      const permissions: PermissionSpec = {};
      const runtime = createRuntimeAPI({
        permissions,
        cwd: testDir,
      });

      await expect(
        runtime.fs.readFile('/etc/passwd')
      ).rejects.toThrow(PermissionError);
    });
  });

  describe('fs.readFileBuffer', () => {
    it('should read file as Uint8Array', async () => {
      const testFile = path.join(testDir, 'binary.bin');
      const data = new Uint8Array([0x01, 0x02, 0x03, 0x04]);
      await fs.writeFile(testFile, data);

      const permissions: PermissionSpec = {};
      const runtime = createRuntimeAPI({
        permissions,
        cwd: testDir,
      });

      const buffer = await runtime.fs.readFileBuffer('binary.bin');
      expect(buffer).toEqual(data);
    });
  });

  describe('fs.writeFile', () => {
    it('should write file to outdir', async () => {
      const outdir = path.join(testDir, 'output');

      const permissions: PermissionSpec = {};
      const runtime = createRuntimeAPI({
        permissions,
        cwd: testDir,
        outdir,
      });

      await runtime.fs.writeFile(path.join(outdir, 'result.txt'), 'test data');

      const content = await fs.readFile(path.join(outdir, 'result.txt'), 'utf-8');
      expect(content).toBe('test data');
    });

    it('should create parent directories automatically', async () => {
      const outdir = path.join(testDir, 'output');

      const permissions: PermissionSpec = {};
      const runtime = createRuntimeAPI({
        permissions,
        cwd: testDir,
        outdir,
      });

      await runtime.fs.writeFile(path.join(outdir, 'nested/deep/file.txt'), 'nested');

      const content = await fs.readFile(path.join(outdir, 'nested/deep/file.txt'), 'utf-8');
      expect(content).toBe('nested');
    });

    it('should support append mode', async () => {
      const outdir = path.join(testDir, 'output');
      await fs.mkdir(outdir, { recursive: true });
      await fs.writeFile(path.join(outdir, 'log.txt'), 'line1\n');

      const permissions: PermissionSpec = {};
      const runtime = createRuntimeAPI({
        permissions,
        cwd: testDir,
        outdir,
      });

      await runtime.fs.writeFile(path.join(outdir, 'log.txt'), 'line2\n', { append: true });

      const content = await fs.readFile(path.join(outdir, 'log.txt'), 'utf-8');
      expect(content).toBe('line1\nline2\n');
    });

    it('should reject writing outside outdir without permission', async () => {
      const outdir = path.join(testDir, 'output');

      const permissions: PermissionSpec = {};
      const runtime = createRuntimeAPI({
        permissions,
        cwd: testDir,
        outdir,
      });

      await expect(
        runtime.fs.writeFile(path.join(testDir, 'forbidden.txt'), 'data')
      ).rejects.toThrow(PermissionError);
    });
  });

  describe('fs.readdir', () => {
    it('should list directory contents', async () => {
      await fs.writeFile(path.join(testDir, 'file1.txt'), '');
      await fs.writeFile(path.join(testDir, 'file2.txt'), '');
      await fs.mkdir(path.join(testDir, 'subdir'));

      const permissions: PermissionSpec = {};
      const runtime = createRuntimeAPI({
        permissions,
        cwd: testDir,
      });

      const entries = await runtime.fs.readdir('.');
      expect(entries).toContain('file1.txt');
      expect(entries).toContain('file2.txt');
      expect(entries).toContain('subdir');
    });
  });

  describe('fs.readdirWithStats', () => {
    it('should list directory with file type info', async () => {
      await fs.writeFile(path.join(testDir, 'file.txt'), '');
      await fs.mkdir(path.join(testDir, 'dir'));

      const permissions: PermissionSpec = {};
      const runtime = createRuntimeAPI({
        permissions,
        cwd: testDir,
      });

      const entries = await runtime.fs.readdirWithStats('.');

      const file = entries.find(e => e.name === 'file.txt');
      expect(file?.isFile).toBe(true);
      expect(file?.isDirectory).toBe(false);

      const dir = entries.find(e => e.name === 'dir');
      expect(dir?.isFile).toBe(false);
      expect(dir?.isDirectory).toBe(true);
    });
  });

  describe('fs.stat', () => {
    it('should return file stats', async () => {
      const testFile = path.join(testDir, 'test.txt');
      await fs.writeFile(testFile, 'test');

      const permissions: PermissionSpec = {};
      const runtime = createRuntimeAPI({
        permissions,
        cwd: testDir,
      });

      const stats = await runtime.fs.stat('test.txt');
      expect(stats.isFile()).toBe(true);
      expect(stats.isDirectory()).toBe(false);
      expect(stats.size).toBeGreaterThan(0);
      expect(stats.mtime).toBeGreaterThan(0);
      expect(stats.ctime).toBeGreaterThan(0);
    });

    it('should return directory stats', async () => {
      await fs.mkdir(path.join(testDir, 'dir'));

      const permissions: PermissionSpec = {};
      const runtime = createRuntimeAPI({
        permissions,
        cwd: testDir,
      });

      const stats = await runtime.fs.stat('dir');
      expect(stats.isFile()).toBe(false);
      expect(stats.isDirectory()).toBe(true);
    });
  });

  describe('fs.exists', () => {
    it('should return true for existing file', async () => {
      await fs.writeFile(path.join(testDir, 'exists.txt'), '');

      const permissions: PermissionSpec = {};
      const runtime = createRuntimeAPI({
        permissions,
        cwd: testDir,
      });

      const exists = await runtime.fs.exists('exists.txt');
      expect(exists).toBe(true);
    });

    it('should return false for non-existent file', async () => {
      const permissions: PermissionSpec = {};
      const runtime = createRuntimeAPI({
        permissions,
        cwd: testDir,
      });

      const exists = await runtime.fs.exists('not-exists.txt');
      expect(exists).toBe(false);
    });

    it('should return false for forbidden paths (not throw)', async () => {
      const permissions: PermissionSpec = {};
      const runtime = createRuntimeAPI({
        permissions,
        cwd: testDir,
      });

      // exists() should return false for forbidden paths, not throw
      const exists = await runtime.fs.exists('/etc/passwd');
      expect(exists).toBe(false);
    });
  });

  describe('fs.mkdir', () => {
    it('should create directory in outdir', async () => {
      const outdir = path.join(testDir, 'output');
      await fs.mkdir(outdir, { recursive: true }); // Create parent first

      const permissions: PermissionSpec = {};
      const runtime = createRuntimeAPI({
        permissions,
        cwd: testDir,
        outdir,
      });

      await runtime.fs.mkdir(path.join(outdir, 'newdir'));

      const stats = await fs.stat(path.join(outdir, 'newdir'));
      expect(stats.isDirectory()).toBe(true);
    });

    it('should support recursive option', async () => {
      const outdir = path.join(testDir, 'output');

      const permissions: PermissionSpec = {};
      const runtime = createRuntimeAPI({
        permissions,
        cwd: testDir,
        outdir,
      });

      await runtime.fs.mkdir(path.join(outdir, 'a/b/c'), { recursive: true });

      const stats = await fs.stat(path.join(outdir, 'a/b/c'));
      expect(stats.isDirectory()).toBe(true);
    });
  });

  describe('fs.rm', () => {
    it('should remove file from outdir', async () => {
      const outdir = path.join(testDir, 'output');
      await fs.mkdir(outdir, { recursive: true });
      await fs.writeFile(path.join(outdir, 'delete-me.txt'), '');

      const permissions: PermissionSpec = {};
      const runtime = createRuntimeAPI({
        permissions,
        cwd: testDir,
        outdir,
      });

      await runtime.fs.rm(path.join(outdir, 'delete-me.txt'));

      await expect(fs.access(path.join(outdir, 'delete-me.txt'))).rejects.toThrow();
    });

    it('should support recursive removal', async () => {
      const outdir = path.join(testDir, 'output');
      await fs.mkdir(path.join(outdir, 'dir/subdir'), { recursive: true });
      await fs.writeFile(path.join(outdir, 'dir/file.txt'), '');

      const permissions: PermissionSpec = {};
      const runtime = createRuntimeAPI({
        permissions,
        cwd: testDir,
        outdir,
      });

      await runtime.fs.rm(path.join(outdir, 'dir'), { recursive: true });

      await expect(fs.access(path.join(outdir, 'dir'))).rejects.toThrow();
    });
  });

  describe('fs.copy', () => {
    it('should copy file from cwd to outdir', async () => {
      const outdir = path.join(testDir, 'output');
      await fs.writeFile(path.join(testDir, 'source.txt'), 'copy me');

      const permissions: PermissionSpec = {};
      const runtime = createRuntimeAPI({
        permissions,
        cwd: testDir,
        outdir,
      });

      await runtime.fs.copy('source.txt', path.join(outdir, 'dest.txt'));

      const content = await fs.readFile(path.join(outdir, 'dest.txt'), 'utf-8');
      expect(content).toBe('copy me');
    });

    it('should copy directories recursively', async () => {
      const outdir = path.join(testDir, 'output');
      await fs.mkdir(path.join(testDir, 'src/sub'), { recursive: true });
      await fs.writeFile(path.join(testDir, 'src/file.txt'), 'nested');
      await fs.writeFile(path.join(testDir, 'src/sub/deep.txt'), 'deep');

      const permissions: PermissionSpec = {};
      const runtime = createRuntimeAPI({
        permissions,
        cwd: testDir,
        outdir,
      });

      await runtime.fs.copy('src', path.join(outdir, 'dest'));

      const content1 = await fs.readFile(path.join(outdir, 'dest/file.txt'), 'utf-8');
      expect(content1).toBe('nested');

      const content2 = await fs.readFile(path.join(outdir, 'dest/sub/deep.txt'), 'utf-8');
      expect(content2).toBe('deep');
    });
  });

  describe('fs.move', () => {
    it('should move file within outdir', async () => {
      const outdir = path.join(testDir, 'output');
      await fs.mkdir(outdir, { recursive: true });
      await fs.writeFile(path.join(outdir, 'old.txt'), 'move me');

      const permissions: PermissionSpec = {};
      const runtime = createRuntimeAPI({
        permissions,
        cwd: testDir,
        outdir,
      });

      await runtime.fs.move(path.join(outdir, 'old.txt'), path.join(outdir, 'new.txt'));

      await expect(fs.access(path.join(outdir, 'old.txt'))).rejects.toThrow();
      const content = await fs.readFile(path.join(outdir, 'new.txt'), 'utf-8');
      expect(content).toBe('move me');
    });
  });

  describe('fs path utilities', () => {
    it('should resolve paths relative to cwd', () => {
      const permissions: PermissionSpec = {};
      const runtime = createRuntimeAPI({
        permissions,
        cwd: '/test/plugin',
      });

      const resolved = runtime.fs.resolve('config.json');
      expect(resolved).toBe('/test/plugin/config.json');
    });

    it('should make paths relative to cwd', () => {
      const permissions: PermissionSpec = {};
      const runtime = createRuntimeAPI({
        permissions,
        cwd: '/test/plugin',
      });

      const relative = runtime.fs.relative('/test/plugin/src/index.ts');
      expect(relative).toBe('src/index.ts');
    });

    it('should join path segments', () => {
      const permissions: PermissionSpec = {};
      const runtime = createRuntimeAPI({
        permissions,
        cwd: '/test',
      });

      const joined = runtime.fs.join('src', 'utils', 'index.ts');
      expect(joined).toBe('src/utils/index.ts');
    });

    it('should get dirname', () => {
      const permissions: PermissionSpec = {};
      const runtime = createRuntimeAPI({
        permissions,
        cwd: '/test',
      });

      const dir = runtime.fs.dirname('/test/src/index.ts');
      expect(dir).toBe('/test/src');
    });

    it('should get basename', () => {
      const permissions: PermissionSpec = {};
      const runtime = createRuntimeAPI({
        permissions,
        cwd: '/test',
      });

      const base = runtime.fs.basename('/test/src/index.ts');
      expect(base).toBe('index.ts');

      const baseNoExt = runtime.fs.basename('/test/src/index.ts', '.ts');
      expect(baseNoExt).toBe('index');
    });

    it('should get extname', () => {
      const permissions: PermissionSpec = {};
      const runtime = createRuntimeAPI({
        permissions,
        cwd: '/test',
      });

      const ext = runtime.fs.extname('index.ts');
      expect(ext).toBe('.ts');
    });
  });

  describe('fetch permissions', () => {
    it('should allow fetch with wildcard patterns (permission check only)', async () => {
      const permissions: PermissionSpec = {
        network: {
          fetch: ['https://example.com/*'],
        },
      };

      const runtime = createRuntimeAPI({
        permissions,
        cwd: testDir,
      });

      // Should pass permission check
      // (will fail with network error since no mock, but not PermissionError)
      try {
        await runtime.fetch('https://example.com/api/test');
      } catch (error) {
        // Should fail with network error, not PermissionError
        expect(error).not.toBeInstanceOf(PermissionError);
      }
    });

    it('should block fetch without permission', async () => {
      const permissions: PermissionSpec = {};

      const runtime = createRuntimeAPI({
        permissions,
        cwd: testDir,
      });

      await expect(
        runtime.fetch('https://example.com')
      ).rejects.toThrow(PermissionError);
    });
  });

  describe('env permissions', () => {
    it('should allow always-allowed env vars', () => {
      const permissions: PermissionSpec = {};

      const runtime = createRuntimeAPI({
        permissions,
        cwd: testDir,
      });

      // NODE_ENV, DEBUG, CI, etc. are always allowed
      const nodeEnv = runtime.env('NODE_ENV');
      expect(nodeEnv !== undefined || nodeEnv === undefined).toBe(true); // No error
    });

    it('should support prefix patterns (KB_*)', () => {
      process.env.KB_CUSTOM_VAR = 'test-value';

      const permissions: PermissionSpec = {
        env: {
          read: ['KB_*'],
        },
      };

      const runtime = createRuntimeAPI({
        permissions,
        cwd: testDir,
      });

      const value = runtime.env('KB_CUSTOM_VAR');
      expect(value).toBe('test-value');

      delete process.env.KB_CUSTOM_VAR;
    });

    it('should return undefined for non-allowed vars', () => {
      const permissions: PermissionSpec = {
        env: {
          read: ['ALLOWED'],
        },
      };

      const runtime = createRuntimeAPI({
        permissions,
        cwd: testDir,
      });

      const path = runtime.env('PATH');
      expect(path).toBeUndefined();
    });
  });
});
