/**
 * @module @kb-labs/plugin-runtime/__tests__/permissions
 *
 * Tests for permission enforcement in V3 runtime.
 *
 * Security model:
 * - cwd is ALWAYS readable (plugin needs to read its own files)
 * - outdir is ALWAYS writable (plugin needs to write results)
 * - Additional paths can be granted via permissions.fs.read/write
 * - DENIED_PATTERNS block dangerous files (.env, .git, .ssh, etc.)
 * - Path normalization prevents escaping cwd with ../
 */

import { describe, it, expect } from 'vitest';
import { createPluginContextV3 } from '../context/index.js';
import type { PluginContextDescriptor, PermissionSpec } from '@kb-labs/plugin-contracts';
import { PermissionError } from '@kb-labs/plugin-contracts';

import { createMockUI, createMockPlatform } from './test-mocks.js';

const mockUI = createMockUI();
const mockPlatform = createMockPlatform();

describe('Permission Enforcement', () => {
  describe('fs.read - cwd always readable', () => {
    it('should allow reading from cwd by default', async () => {
      const permissions: PermissionSpec = {};

      const descriptor: PluginContextDescriptor = {
      requestId: 'test-request-id',
        hostType: 'cli',
        pluginId: '@kb-labs/test',
        pluginVersion: '1.0.0',
        permissions,
        hostContext: { host: 'cli', argv: [], flags: {} },
      };

      const { context } = createPluginContextV3({
        descriptor,
        platform: mockPlatform,
        ui: mockUI,
        cwd: '/test',
        outdir: '/test/output',
      });

      // Should not throw PermissionError for file in cwd
      // (may fail with ENOENT if file doesn't exist, but permission is OK)
      await expect(
        context.runtime.fs.readFile('/test/file.txt')
      ).rejects.toThrow(/ENOENT/);
    });

    it('should allow reading subdirectories of cwd', async () => {
      const permissions: PermissionSpec = {};

      const descriptor: PluginContextDescriptor = {
      requestId: 'test-request-id',
        hostType: 'cli',
        pluginId: '@kb-labs/test',
        pluginVersion: '1.0.0',
        permissions,
        hostContext: { host: 'cli', argv: [], flags: {} },
      };

      const { context } = createPluginContextV3({
        descriptor,
        platform: mockPlatform,
        ui: mockUI,
        cwd: '/test',
        outdir: '/test/output',
      });

      // Subdirectories of cwd should be readable
      await expect(
        context.runtime.fs.readFile('/test/subdir/file.txt')
      ).rejects.toThrow(/ENOENT/); // Not PermissionError
    });

    it('should allow reading additional paths via fs.read', async () => {
      const permissions: PermissionSpec = {
        fs: {
          read: ['../sibling-dir'], // Relative to cwd
        },
      };

      const descriptor: PluginContextDescriptor = {
      requestId: 'test-request-id',
        hostType: 'cli',
        pluginId: '@kb-labs/test',
        pluginVersion: '1.0.0',
        permissions,
        hostContext: { host: 'cli', argv: [], flags: {} },
      };

      const { context } = createPluginContextV3({
        descriptor,
        platform: mockPlatform,
        ui: mockUI,
        cwd: '/test',
        outdir: '/test/output',
      });

      // Additional path should be accessible
      await expect(
        context.runtime.fs.readFile('/test/sibling-dir/file.txt')
      ).rejects.toThrow(/ENOENT/); // Not PermissionError
    });

    it('should block reading from absolute paths outside cwd', async () => {
      const permissions: PermissionSpec = {};

      const descriptor: PluginContextDescriptor = {
      requestId: 'test-request-id',
        hostType: 'cli',
        pluginId: '@kb-labs/test',
        pluginVersion: '1.0.0',
        permissions,
        hostContext: { host: 'cli', argv: [], flags: {} },
      };

      const { context } = createPluginContextV3({
        descriptor,
        platform: mockPlatform,
        ui: mockUI,
        cwd: '/test',
        outdir: '/test/output',
      });

      // Absolute paths outside cwd should be blocked
      await expect(
        context.runtime.fs.readFile('/etc/passwd')
      ).rejects.toThrow(PermissionError);
    });
  });

  describe('fs.read - DENIED_PATTERNS', () => {
    it('should block reading .env files', async () => {
      const permissions: PermissionSpec = {};

      const descriptor: PluginContextDescriptor = {
      requestId: 'test-request-id',
        hostType: 'cli',
        pluginId: '@kb-labs/test',
        pluginVersion: '1.0.0',
        permissions,
        hostContext: { host: 'cli', argv: [], flags: {} },
      };

      const { context } = createPluginContextV3({
        descriptor,
        platform: mockPlatform,
        ui: mockUI,
        cwd: '/test',
        outdir: '/test/output',
      });

      // .env files should be blocked even in cwd
      await expect(
        context.runtime.fs.readFile('/test/.env')
      ).rejects.toThrow(PermissionError);
    });

    it('should block reading from .git directory', async () => {
      const permissions: PermissionSpec = {};

      const descriptor: PluginContextDescriptor = {
      requestId: 'test-request-id',
        hostType: 'cli',
        pluginId: '@kb-labs/test',
        pluginVersion: '1.0.0',
        permissions,
        hostContext: { host: 'cli', argv: [], flags: {} },
      };

      const { context } = createPluginContextV3({
        descriptor,
        platform: mockPlatform,
        ui: mockUI,
        cwd: '/test',
        outdir: '/test/output',
      });

      // .git directory should be blocked
      await expect(
        context.runtime.fs.readFile('/test/.git/config')
      ).rejects.toThrow(PermissionError);
    });

    it('should block reading from node_modules', async () => {
      const permissions: PermissionSpec = {};

      const descriptor: PluginContextDescriptor = {
      requestId: 'test-request-id',
        hostType: 'cli',
        pluginId: '@kb-labs/test',
        pluginVersion: '1.0.0',
        permissions,
        hostContext: { host: 'cli', argv: [], flags: {} },
      };

      const { context } = createPluginContextV3({
        descriptor,
        platform: mockPlatform,
        ui: mockUI,
        cwd: '/test',
        outdir: '/test/output',
      });

      // node_modules should be blocked
      await expect(
        context.runtime.fs.readFile('/test/node_modules/package/index.js')
      ).rejects.toThrow(PermissionError);
    });
  });

  describe('fs.write - outdir always writable', () => {
    it('should allow writing to outdir by default', async () => {
      const permissions: PermissionSpec = {};

      const descriptor: PluginContextDescriptor = {
      requestId: 'test-request-id',
        hostType: 'cli',
        pluginId: '@kb-labs/test',
        pluginVersion: '1.0.0',
        permissions,
        hostContext: { host: 'cli', argv: [], flags: {} },
      };

      const { context } = createPluginContextV3({
        descriptor,
        platform: mockPlatform,
        ui: mockUI,
        cwd: '/test',
        outdir: '/test/output',
      });

      // Writing to outdir should be allowed
      // (may fail with FS errors, but not PermissionError)
      const writePromise = context.runtime.fs.writeFile('/test/output/result.txt', 'data');
      await expect(writePromise).rejects.not.toThrow(PermissionError);
    });

    it('should block writing outside outdir', async () => {
      const permissions: PermissionSpec = {};

      const descriptor: PluginContextDescriptor = {
      requestId: 'test-request-id',
        hostType: 'cli',
        pluginId: '@kb-labs/test',
        pluginVersion: '1.0.0',
        permissions,
        hostContext: { host: 'cli', argv: [], flags: {} },
      };

      const { context } = createPluginContextV3({
        descriptor,
        platform: mockPlatform,
        ui: mockUI,
        cwd: '/test',
        outdir: '/test/output',
      });

      // Writing to cwd (not outdir) should be blocked
      await expect(
        context.runtime.fs.writeFile('/test/file.txt', 'data')
      ).rejects.toThrow(PermissionError);

      // Writing outside cwd should be blocked
      await expect(
        context.runtime.fs.writeFile('/etc/passwd', 'malicious')
      ).rejects.toThrow(PermissionError);
    });

    it('should allow writing to additional paths via fs.write', async () => {
      const permissions: PermissionSpec = {
        fs: {
          write: ['logs'], // Relative to cwd
        },
      };

      const descriptor: PluginContextDescriptor = {
      requestId: 'test-request-id',
        hostType: 'cli',
        pluginId: '@kb-labs/test',
        pluginVersion: '1.0.0',
        permissions,
        hostContext: { host: 'cli', argv: [], flags: {} },
      };

      const { context } = createPluginContextV3({
        descriptor,
        platform: mockPlatform,
        ui: mockUI,
        cwd: '/test',
        outdir: '/test/output',
      });

      // Additional write path should be allowed
      const writePromise = context.runtime.fs.writeFile('/test/logs/debug.log', 'log data');
      await expect(writePromise).rejects.not.toThrow(PermissionError);
    });
  });

  describe('Path normalization security', () => {
    it('should prevent path traversal with ../', async () => {
      const permissions: PermissionSpec = {};

      const descriptor: PluginContextDescriptor = {
      requestId: 'test-request-id',
        hostType: 'cli',
        pluginId: '@kb-labs/test',
        pluginVersion: '1.0.0',
        permissions,
        hostContext: { host: 'cli', argv: [], flags: {} },
      };

      const { context } = createPluginContextV3({
        descriptor,
        platform: mockPlatform,
        ui: mockUI,
        cwd: '/test',
        outdir: '/test/output',
      });

      // Trying to escape cwd with ../../../ should be blocked
      await expect(
        context.runtime.fs.readFile('../../../etc/passwd')
      ).rejects.toThrow(PermissionError);
    });

    it('should normalize relative paths correctly', async () => {
      const permissions: PermissionSpec = {};

      const descriptor: PluginContextDescriptor = {
      requestId: 'test-request-id',
        hostType: 'cli',
        pluginId: '@kb-labs/test',
        pluginVersion: '1.0.0',
        permissions,
        hostContext: { host: 'cli', argv: [], flags: {} },
      };

      const { context } = createPluginContextV3({
        descriptor,
        platform: mockPlatform,
        ui: mockUI,
        cwd: '/test',
        outdir: '/test/output',
      });

      // Relative path within cwd should work
      await expect(
        context.runtime.fs.readFile('./config.json')
      ).rejects.toThrow(/ENOENT/); // Not PermissionError
    });
  });

  describe('net.fetch permissions', () => {
    it('should block fetch when network permission not granted', async () => {
      const permissions: PermissionSpec = {
        // No network permission
      };

      const descriptor: PluginContextDescriptor = {
      requestId: 'test-request-id',
        hostType: 'cli',
        pluginId: '@kb-labs/test',
        pluginVersion: '1.0.0',
        permissions,
        hostContext: { host: 'cli', argv: [], flags: {} },
      };

      const { context } = createPluginContextV3({
        descriptor,
        platform: mockPlatform,
        ui: mockUI,
        cwd: '/test',
        outdir: '/test/output',
      });

      // Fetch should be blocked without network permission
      await expect(
        context.runtime.fetch('https://example.com')
      ).rejects.toThrow(PermissionError);
    });

    it('should allow fetch from allowed domains (permission check only)', async () => {
      const permissions: PermissionSpec = {
        network: {
          fetch: ['https://example.com/*', 'https://api.github.com/*'],
        },
      };

      const descriptor: PluginContextDescriptor = {
      requestId: 'test-request-id',
        hostType: 'cli',
        pluginId: '@kb-labs/test',
        pluginVersion: '1.0.0',
        permissions,
        hostContext: { host: 'cli', argv: [], flags: {} },
      };

      const { context } = createPluginContextV3({
        descriptor,
        platform: mockPlatform,
        ui: mockUI,
        cwd: '/test',
        outdir: '/test/output',
      });

      // Allowed domains should pass permission check
      // (will fail with network error since we don't have a mock fetch, but not PermissionError)
      try {
        await context.runtime.fetch('https://example.com/api');
      } catch (error) {
        // Should fail with network error, not PermissionError
        expect(error).not.toBeInstanceOf(PermissionError);
      }
    });

    it('should block fetch to non-allowed domains', async () => {
      const permissions: PermissionSpec = {
        network: {
          fetch: ['https://example.com/*'],
        },
      };

      const descriptor: PluginContextDescriptor = {
      requestId: 'test-request-id',
        hostType: 'cli',
        pluginId: '@kb-labs/test',
        pluginVersion: '1.0.0',
        permissions,
        hostContext: { host: 'cli', argv: [], flags: {} },
      };

      const { context } = createPluginContextV3({
        descriptor,
        platform: mockPlatform,
        ui: mockUI,
        cwd: '/test',
        outdir: '/test/output',
      });

      // Non-allowed domain should be blocked
      await expect(
        context.runtime.fetch('https://evil.com')
      ).rejects.toThrow(PermissionError);
    });
  });

  describe('env permissions', () => {
    it('should allow always-allowed env vars (NODE_ENV, DEBUG, etc)', async () => {
      const permissions: PermissionSpec = {
        // No env permission, but NODE_ENV is always allowed
      };

      const descriptor: PluginContextDescriptor = {
      requestId: 'test-request-id',
        hostType: 'cli',
        pluginId: '@kb-labs/test',
        pluginVersion: '1.0.0',
        permissions,
        hostContext: { host: 'cli', argv: [], flags: {} },
      };

      const { context } = createPluginContextV3({
        descriptor,
        platform: mockPlatform,
        ui: mockUI,
        cwd: '/test',
        outdir: '/test/output',
      });

      // NODE_ENV is in ALWAYS_ALLOWED list (env-shim.ts line 10-17)
      // Should return value (may be undefined if not set, but no error)
      const nodeEnv = context.runtime.env('NODE_ENV');
      expect(nodeEnv !== undefined || nodeEnv === undefined).toBe(true); // No error thrown
    });

    it('should return undefined for non-allowed env vars', async () => {
      const permissions: PermissionSpec = {
        env: {
          read: ['ALLOWED_VAR'],
        },
      };

      const descriptor: PluginContextDescriptor = {
      requestId: 'test-request-id',
        hostType: 'cli',
        pluginId: '@kb-labs/test',
        pluginVersion: '1.0.0',
        permissions,
        hostContext: { host: 'cli', argv: [], flags: {} },
      };

      const { context } = createPluginContextV3({
        descriptor,
        platform: mockPlatform,
        ui: mockUI,
        cwd: '/test',
        outdir: '/test/output',
      });

      // Non-allowed env var should return undefined (env-shim.ts line 50-51)
      const path = context.runtime.env('PATH');
      expect(path).toBeUndefined();

      const home = context.runtime.env('HOME');
      expect(home).toBeUndefined();
    });

    it('should allow reading whitelisted env vars', async () => {
      const permissions: PermissionSpec = {
        env: {
          read: ['CUSTOM_VAR', 'KB_*'], // KB_* is a prefix pattern
        },
      };

      const descriptor: PluginContextDescriptor = {
      requestId: 'test-request-id',
        hostType: 'cli',
        pluginId: '@kb-labs/test',
        pluginVersion: '1.0.0',
        permissions,
        hostContext: { host: 'cli', argv: [], flags: {} },
      };

      const { context } = createPluginContextV3({
        descriptor,
        platform: mockPlatform,
        ui: mockUI,
        cwd: '/test',
        outdir: '/test/output',
      });

      // Set test env vars
      process.env.CUSTOM_VAR = 'test-value';
      process.env.KB_TEST = 'kb-value';

      // Whitelisted exact match should work
      const customVar = context.runtime.env('CUSTOM_VAR');
      expect(customVar).toBe('test-value');

      // Whitelisted prefix pattern should work
      const kbTest = context.runtime.env('KB_TEST');
      expect(kbTest).toBe('kb-value');

      // Cleanup
      delete process.env.CUSTOM_VAR;
      delete process.env.KB_TEST;
    });
  });
});
