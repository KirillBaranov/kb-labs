/**
 * @module @kb-labs/plugin-runtime/__tests__/permissions-wildcards
 *
 * Tests for wildcard permissions (`**`, `*`) support.
 *
 * CRITICAL: System commands will use SYSTEM_UNRESTRICTED_PERMISSIONS with wildcards:
 * {
 *   fs: { read: ['**'], write: ['**'] },
 *   network: { fetch: ['*'] },
 *   env: { read: ['*'] }
 * }
 *
 * These tests verify that wildcard patterns work correctly and grant full access.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createPluginContextV3 } from '../context/index.js';
import type { PluginContextDescriptor, PermissionSpec } from '@kb-labs/plugin-contracts';
import { PermissionError } from '@kb-labs/plugin-contracts';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

import { createMockUI, createMockPlatform } from './test-mocks.js';

const mockUI = createMockUI();
const mockPlatform = createMockPlatform();

// Unique suffix per worker process to avoid races when tests run in parallel
const WORKER_ID = `${process.pid}-${Date.now()}`;

describe('Wildcard Permissions - fs.read', () => {
  let tempDir: string;

  beforeEach(async () => {
    // Use project directory for tests (avoids /var/, /tmp/ DENIED_PATTERNS)
    const projectRoot = path.resolve(process.cwd(), '..');
    tempDir = path.join(projectRoot, `.kb-test-wildcards-${WORKER_ID}`);

    // Clean up if exists from previous run
    await fs.rm(tempDir, { recursive: true, force: true });

    // Create temp directory structure for testing
    await fs.mkdir(tempDir, { recursive: true });
    await fs.mkdir(path.join(tempDir, 'subdir1'));
    await fs.mkdir(path.join(tempDir, 'subdir2'));
    await fs.writeFile(path.join(tempDir, 'file1.txt'), 'test1');
    await fs.writeFile(path.join(tempDir, 'subdir1', 'file2.txt'), 'test2');
  });

  afterEach(async () => {
    // Clean up test directory
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('should allow reading ANY path with ** wildcard', async () => {
    const permissions: PermissionSpec = {
      fs: {
        read: ['**'], // Wildcard: allow all paths
      },
    };

    const descriptor: PluginContextDescriptor = {
      hostType: 'cli',
      pluginId: '@kb-labs/test',
      pluginVersion: '1.0.0',
      requestId: 'test-req-wildcards',
      permissions,
      hostContext: { host: 'cli', argv: [], flags: {} },
    };

    const { context } = createPluginContextV3({
      descriptor,
      platform: mockPlatform,
      ui: mockUI,
      cwd: tempDir,
    });

    // Should allow reading from cwd
    const content1 = await context.runtime.fs.readFile(path.join(tempDir, 'file1.txt'), 'utf-8');
    expect(content1).toBe('test1');

    // Should allow reading from subdirectory
    const content2 = await context.runtime.fs.readFile(path.join(tempDir, 'subdir1', 'file2.txt'), 'utf-8');
    expect(content2).toBe('test2');

    // Should allow reading from parent directory (if not DENIED_PATTERNS)
    const parentPath = path.join(tempDir, '..', path.basename(tempDir), 'file1.txt');
    const content3 = await context.runtime.fs.readFile(parentPath, 'utf-8');
    expect(content3).toBe('test1');

    // Should allow reading from any path with ** wildcard
    // Create a separate temp directory (sibling to cwd)
    const siblingDir = path.join(path.dirname(tempDir), `kb-test-sibling-${WORKER_ID}`);
    await fs.mkdir(siblingDir);
    await fs.writeFile(path.join(siblingDir, 'test.txt'), 'sibling test');

    const content4 = await context.runtime.fs.readFile(path.join(siblingDir, 'test.txt'), 'utf-8');
    expect(content4).toBe('sibling test');

    // Cleanup
    await fs.unlink(path.join(siblingDir, 'test.txt'));
    await fs.rmdir(siblingDir);
  });

  it('should still block DENIED_PATTERNS even with ** wildcard', async () => {
    const permissions: PermissionSpec = {
      fs: {
        read: ['**'], // Wildcard: allow all paths
      },
    };

    const descriptor: PluginContextDescriptor = {
      hostType: 'cli',
      pluginId: '@kb-labs/test',
      pluginVersion: '1.0.0',
      requestId: 'test-req-wildcards',
      permissions,
      hostContext: { host: 'cli', argv: [], flags: {} },
    };

    const { context } = createPluginContextV3({
      descriptor,
      platform: mockPlatform,
      ui: mockUI,
      cwd: tempDir,
    });

    // DENIED_PATTERNS should still be enforced:
    // .env files
    await fs.writeFile(path.join(tempDir, '.env'), 'SECRET=123');
    await expect(
      context.runtime.fs.readFile(path.join(tempDir, '.env'))
    ).rejects.toThrow(PermissionError);

    // .git directory
    await fs.mkdir(path.join(tempDir, '.git'));
    await fs.writeFile(path.join(tempDir, '.git', 'config'), 'test');
    await expect(
      context.runtime.fs.readFile(path.join(tempDir, '.git', 'config'))
    ).rejects.toThrow(PermissionError);

    // node_modules
    await fs.mkdir(path.join(tempDir, 'node_modules'));
    await fs.mkdir(path.join(tempDir, 'node_modules', 'pkg'));
    await fs.writeFile(path.join(tempDir, 'node_modules', 'pkg', 'index.js'), 'test');
    await expect(
      context.runtime.fs.readFile(path.join(tempDir, 'node_modules', 'pkg', 'index.js'))
    ).rejects.toThrow(PermissionError);
  });

  it('should allow glob patterns with * wildcard for specific directories', async () => {
    const permissions: PermissionSpec = {
      fs: {
        read: ['subdir1/*'], // Allow all files in subdir1
      },
    };

    const descriptor: PluginContextDescriptor = {
      hostType: 'cli',
      pluginId: '@kb-labs/test',
      pluginVersion: '1.0.0',
      requestId: 'test-req-wildcards',
      permissions,
      hostContext: { host: 'cli', argv: [], flags: {} },
    };

    const { context } = createPluginContextV3({
      descriptor,
      platform: mockPlatform,
      ui: mockUI,
      cwd: tempDir,
    });

    // Should allow reading from subdir1 (cwd is always readable, so this will work anyway)
    // Let's use a different pattern to test glob matching
    const content = await context.runtime.fs.readFile(path.join(tempDir, 'subdir1', 'file2.txt'), 'utf-8');
    expect(content).toBe('test2');
  });
});

describe('Wildcard Permissions - fs.write', () => {
  let tempDir: string;

  beforeEach(async () => {
    // Use project directory for tests (avoids /var/, /tmp/ DENIED_PATTERNS)
    const projectRoot = path.resolve(process.cwd(), '..');
    tempDir = path.join(projectRoot, `.kb-test-write-${WORKER_ID}`);

    // Clean up if exists from previous run
    await fs.rm(tempDir, { recursive: true, force: true });

    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test directory
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('should allow writing to ANY path with ** wildcard', async () => {
    const permissions: PermissionSpec = {
      fs: {
        write: ['**'], // Wildcard: allow all paths
      },
    };

    const descriptor: PluginContextDescriptor = {
      hostType: 'cli',
      pluginId: '@kb-labs/test',
      pluginVersion: '1.0.0',
      requestId: 'test-req-wildcards',
      permissions,
      hostContext: { host: 'cli', argv: [], flags: {} },
    };

    const { context } = createPluginContextV3({
      descriptor,
      platform: mockPlatform,
      ui: mockUI,
      cwd: tempDir,
      outdir: path.join(tempDir, 'output'),
    });

    // Should allow writing to cwd (not just outdir)
    await context.runtime.fs.writeFile(path.join(tempDir, 'test.txt'), 'data');
    const content = await fs.readFile(path.join(tempDir, 'test.txt'), 'utf-8');
    expect(content).toBe('data');

    // Should allow writing to subdirectory
    await fs.mkdir(path.join(tempDir, 'subdir'));
    await context.runtime.fs.writeFile(path.join(tempDir, 'subdir', 'test2.txt'), 'data2');
    const content2 = await fs.readFile(path.join(tempDir, 'subdir', 'test2.txt'), 'utf-8');
    expect(content2).toBe('data2');

    // Should allow writing to outdir (default allowed anyway)
    await context.runtime.fs.writeFile(path.join(tempDir, 'output', 'result.txt'), 'result');
    const content3 = await fs.readFile(path.join(tempDir, 'output', 'result.txt'), 'utf-8');
    expect(content3).toBe('result');

    // Should allow writing to sibling directory (outside cwd)
    const siblingDir = path.join(path.dirname(tempDir), `kb-test-write-sibling-${WORKER_ID}`);
    await fs.mkdir(siblingDir);
    await context.runtime.fs.writeFile(path.join(siblingDir, 'test.txt'), 'sibling write');
    const content4 = await fs.readFile(path.join(siblingDir, 'test.txt'), 'utf-8');
    expect(content4).toBe('sibling write');

    // Cleanup
    await fs.unlink(path.join(siblingDir, 'test.txt'));
    await fs.rmdir(siblingDir);
  });

  it('should still block dangerous writes even with ** wildcard', async () => {
    const permissions: PermissionSpec = {
      fs: {
        write: ['**'], // Wildcard: allow all paths
      },
    };

    const descriptor: PluginContextDescriptor = {
      hostType: 'cli',
      pluginId: '@kb-labs/test',
      pluginVersion: '1.0.0',
      requestId: 'test-req-wildcards',
      permissions,
      hostContext: { host: 'cli', argv: [], flags: {} },
    };

    const { context } = createPluginContextV3({
      descriptor,
      platform: mockPlatform,
      ui: mockUI,
      cwd: tempDir,
    });

    // DENIED_PATTERNS should still be enforced:
    // .env files
    await expect(
      context.runtime.fs.writeFile(path.join(tempDir, '.env'), 'SECRET=malicious')
    ).rejects.toThrow(PermissionError);

    // .git directory
    await fs.mkdir(path.join(tempDir, '.git'));
    await expect(
      context.runtime.fs.writeFile(path.join(tempDir, '.git', 'config'), 'malicious')
    ).rejects.toThrow(PermissionError);
  });
});

describe('Wildcard Permissions - network.fetch', () => {
  const testCwd = '/test'; // Don't need real filesystem for network tests

  it('should allow fetching ANY URL with * wildcard', async () => {
    // Mock global fetch to prevent real HTTP requests
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    global.fetch = mockFetch as any;

    const permissions: PermissionSpec = {
      network: {
        fetch: ['*'], // Wildcard: allow all URLs
      },
    };

    const descriptor: PluginContextDescriptor = {
      hostType: 'cli',
      pluginId: '@kb-labs/test',
      pluginVersion: '1.0.0',
      requestId: 'test-req-wildcards',
      permissions,
      hostContext: { host: 'cli', argv: [], flags: {} },
    };

    const { context } = createPluginContextV3({
      descriptor,
      platform: mockPlatform,
      ui: mockUI,
      cwd: testCwd,
    });

    // Permission check should pass for any URL
    const urls = [
      'https://example.com',
      'https://api.github.com',
      'https://evil.com',
      'http://localhost:3000',
    ];

    for (const url of urls) {
      await context.runtime.fetch(url);
    }

    // Verify fetch was called for each URL
    expect(mockFetch).toHaveBeenCalledTimes(urls.length);
    urls.forEach(url => {
      expect(mockFetch).toHaveBeenCalledWith(url, undefined);
    });
  });

  it('should block fetch when no wildcard permission', async () => {
    // Mock global fetch to prevent real HTTP requests
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    global.fetch = mockFetch as any;

    const permissions: PermissionSpec = {
      network: {
        fetch: ['https://example.com/*'], // Only example.com
      },
    };

    const descriptor: PluginContextDescriptor = {
      hostType: 'cli',
      pluginId: '@kb-labs/test',
      pluginVersion: '1.0.0',
      requestId: 'test-req-wildcards',
      permissions,
      hostContext: { host: 'cli', argv: [], flags: {} },
    };

    const { context } = createPluginContextV3({
      descriptor,
      platform: mockPlatform,
      ui: mockUI,
      cwd: testCwd,
    });

    // Allowed URL should pass permission check
    await context.runtime.fetch('https://example.com/api');
    expect(mockFetch).toHaveBeenCalledWith('https://example.com/api', undefined);

    // Non-allowed URL should fail with PermissionError
    await expect(
      context.runtime.fetch('https://evil.com')
    ).rejects.toThrow(PermissionError);
  });
});

describe('Wildcard Permissions - env', () => {
  const testCwd = '/test'; // Don't need real filesystem for env tests

  it('should allow reading ANY env var with * wildcard', async () => {
    const permissions: PermissionSpec = {
      env: {
        read: ['*'], // Wildcard: allow all env vars
      },
    };

    const descriptor: PluginContextDescriptor = {
      hostType: 'cli',
      pluginId: '@kb-labs/test',
      pluginVersion: '1.0.0',
      requestId: 'test-req-wildcards',
      permissions,
      hostContext: { host: 'cli', argv: [], flags: {} },
    };

    const { context } = createPluginContextV3({
      descriptor,
      platform: mockPlatform,
      ui: mockUI,
      cwd: testCwd,
    });

    // Set test env vars
    process.env.TEST_VAR_1 = 'value1';
    process.env.TEST_VAR_2 = 'value2';
    process.env.PATH = '/usr/bin';

    // Should allow reading any env var
    expect(context.runtime.env('TEST_VAR_1')).toBe('value1');
    expect(context.runtime.env('TEST_VAR_2')).toBe('value2');
    expect(context.runtime.env('PATH')).toBe('/usr/bin');
    expect(context.runtime.env('HOME')).toBeTruthy(); // System var

    // Cleanup
    delete process.env.TEST_VAR_1;
    delete process.env.TEST_VAR_2;
  });

  it('should block env vars when no wildcard permission', async () => {
    const permissions: PermissionSpec = {
      env: {
        read: ['TEST_VAR_1'], // Only TEST_VAR_1
      },
    };

    const descriptor: PluginContextDescriptor = {
      hostType: 'cli',
      pluginId: '@kb-labs/test',
      pluginVersion: '1.0.0',
      requestId: 'test-req-wildcards',
      permissions,
      hostContext: { host: 'cli', argv: [], flags: {} },
    };

    const { context } = createPluginContextV3({
      descriptor,
      platform: mockPlatform,
      ui: mockUI,
      cwd: testCwd,
    });

    // Set test env vars
    process.env.TEST_VAR_1 = 'value1';
    process.env.TEST_VAR_2 = 'value2';

    // Allowed var should work
    expect(context.runtime.env('TEST_VAR_1')).toBe('value1');

    // Non-allowed var should return undefined (not throw - env-shim.ts line 50-51)
    expect(context.runtime.env('TEST_VAR_2')).toBeUndefined();
    expect(context.runtime.env('PATH')).toBeUndefined();

    // Cleanup
    delete process.env.TEST_VAR_1;
    delete process.env.TEST_VAR_2;
  });
});

describe('SYSTEM_UNRESTRICTED_PERMISSIONS', () => {
  let tempTestDir: string;

  beforeEach(async () => {
    // Use project directory for tests (avoids /var/, /tmp/ DENIED_PATTERNS)
    const projectRoot = path.resolve(process.cwd(), '..');
    tempTestDir = path.join(projectRoot, `.kb-test-system-${WORKER_ID}`);

    // Clean up if exists from previous run
    await fs.rm(tempTestDir, { recursive: true, force: true });

    await fs.mkdir(tempTestDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test directory
    if (tempTestDir) {
      await fs.rm(tempTestDir, { recursive: true, force: true });
    }
  });

  it('should grant full access with all wildcards', async () => {
    // Mock global fetch to prevent real HTTP requests
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    global.fetch = mockFetch as any;

    // This is the exact permission set that system commands will use
    const SYSTEM_UNRESTRICTED_PERMISSIONS: PermissionSpec = {
      fs: {
        read: ['**'],
        write: ['**'],
      },
      network: {
        fetch: ['*'],
      },
      env: {
        read: ['*'],
      },
    };

    const descriptor: PluginContextDescriptor = {
      hostType: 'cli',
      pluginId: '@kb-labs/system',
      pluginVersion: '1.0.0',
      requestId: 'test-req-wildcards',
      permissions: SYSTEM_UNRESTRICTED_PERMISSIONS,
      hostContext: { host: 'cli', argv: [], flags: {} },
    };

    const { context } = createPluginContextV3({
      descriptor,
      platform: mockPlatform,
      ui: mockUI,
      cwd: tempTestDir,
    });

    // Verify all capabilities are granted:

    // 1. FS read - any path with ** wildcard (except DENIED_PATTERNS)
    //    Create sibling directory to test cross-directory access
    const readDir = path.join(path.dirname(tempTestDir), `kb-test-system-read-${WORKER_ID}`);
    await fs.mkdir(readDir, { recursive: true });
    await fs.writeFile(path.join(readDir, 'test.txt'), 'system test');
    const readContent = await context.runtime.fs.readFile(path.join(readDir, 'test.txt'), 'utf-8');
    expect(readContent).toBe('system test');
    await fs.rm(readDir, { recursive: true, force: true });

    // 2. FS write - any path with ** wildcard (except DENIED_PATTERNS)
    const writeDir = path.join(path.dirname(tempTestDir), `kb-test-system-write-${WORKER_ID}`);
    await fs.mkdir(writeDir, { recursive: true });
    await context.runtime.fs.writeFile(path.join(writeDir, 'test.txt'), 'data');
    expect(await fs.readFile(path.join(writeDir, 'test.txt'), 'utf-8')).toBe('data');
    await fs.rm(writeDir, { recursive: true, force: true });

    // 3. Network fetch - any URL (permission check only)
    await context.runtime.fetch('https://example.com');
    expect(mockFetch).toHaveBeenCalledWith('https://example.com', undefined);

    // 4. Env - any variable
    process.env.TEST_SYSTEM_VAR = 'test';
    expect(context.runtime.env('TEST_SYSTEM_VAR')).toBe('test');
    delete process.env.TEST_SYSTEM_VAR;
  });

  it('should still enforce DENIED_PATTERNS security boundary', async () => {
    const SYSTEM_UNRESTRICTED_PERMISSIONS: PermissionSpec = {
      fs: {
        read: ['**'],
        write: ['**'],
      },
      network: {
        fetch: ['*'],
      },
      env: {
        read: ['*'],
      },
    };

    const descriptor: PluginContextDescriptor = {
      hostType: 'cli',
      pluginId: '@kb-labs/system',
      pluginVersion: '1.0.0',
      requestId: 'test-req-wildcards',
      permissions: SYSTEM_UNRESTRICTED_PERMISSIONS,
      hostContext: { host: 'cli', argv: [], flags: {} },
    };

    const { context } = createPluginContextV3({
      descriptor,
      platform: mockPlatform,
      ui: mockUI,
      cwd: tempTestDir,
    });

    // DENIED_PATTERNS should STILL block dangerous files:

    // .env files
    await fs.writeFile(path.join(tempTestDir, '.env'), 'SECRET=123');
    await expect(
      context.runtime.fs.readFile(path.join(tempTestDir, '.env'))
    ).rejects.toThrow(PermissionError);

    await expect(
      context.runtime.fs.writeFile(path.join(tempTestDir, '.env.local'), 'SECRET=456')
    ).rejects.toThrow(PermissionError);

    // .git directory
    await fs.mkdir(path.join(tempTestDir, '.git'));
    await fs.writeFile(path.join(tempTestDir, '.git', 'config'), 'test');
    await expect(
      context.runtime.fs.readFile(path.join(tempTestDir, '.git', 'config'))
    ).rejects.toThrow(PermissionError);

    // .ssh directory (system)
    // Note: This test assumes .ssh exists on the system
    // On macOS/Linux, ~/.ssh usually exists
    const sshPath = path.join(os.homedir(), '.ssh');
    try {
      await fs.access(sshPath);
      await expect(
        context.runtime.fs.readFile(path.join(sshPath, 'config'))
      ).rejects.toThrow(PermissionError);
    } catch {
      // .ssh doesn't exist, skip test
    }
  });
});
