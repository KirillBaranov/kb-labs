/**
 * @module @kb-labs/plugin-runtime/__tests__/sandbox-runner
 *
 * Tests for sandbox runner (runInProcess and runInSubprocess).
 *
 * Critical component: Entry points for all plugin execution.
 * Failure here breaks ALL V3 plugins.
 *
 * ## RunResult Contract (v5)
 *
 * runInProcess/runInSubprocess now return RunResult<T>:
 * - data: T (raw handler return value)
 * - executionMeta: ExecutionMeta (timing, plugin info, request correlation)
 *
 * Host layer (CLI, REST, etc.) is responsible for wrapping this into
 * host-specific format using wrapCliResult, wrapRestResult, etc.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { runInProcess } from '../sandbox/runner.js';
import { wrapCliResult } from '../host/cli-wrapper.js';
import { PluginError } from '@kb-labs/plugin-contracts';
import type { PluginContextDescriptor } from '@kb-labs/plugin-contracts';
import { createMockUI, createMockPlatform } from './test-mocks.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFileSync, mkdirSync } from 'node:fs';

describe('Sandbox Runner', () => {
  const mockUI = createMockUI();
  const mockPlatform = createMockPlatform();

  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `v3-runner-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  describe('runInProcess - RunResult contract', () => {
    it('should return RunResult with data and executionMeta', async () => {
      const handlerPath = join(testDir, 'simple-handler.js');
      const handlerCode = `
        export default {
          async execute(ctx, input) {
            return { message: 'success', input };
          }
        };
      `;
      writeFileSync(handlerPath, handlerCode);

      const descriptor: PluginContextDescriptor = {
        hostType: 'cli',
        pluginId: '@kb-labs/test',
        pluginVersion: '1.0.0',
        requestId: 'req-123',
        handlerId: 'test:command',
        permissions: {},
        hostContext: { host: 'cli', argv: [], flags: {} },
      };

      const result = await runInProcess({
        descriptor,
        platform: mockPlatform,
        ui: mockUI,
        handlerPath,
        input: { test: 'data' },
        cwd: testDir,
      });

      // Verify RunResult structure
      expect(result.data).toEqual({
        message: 'success',
        input: { test: 'data' },
      });

      // Verify executionMeta
      expect(result.executionMeta).toBeDefined();
      expect(result.executionMeta.pluginId).toBe('@kb-labs/test');
      expect(result.executionMeta.pluginVersion).toBe('1.0.0');
      expect(result.executionMeta.handlerId).toBe('test:command');
      expect(result.executionMeta.requestId).toBe('req-123');
      expect(typeof result.executionMeta.startTime).toBe('number');
      expect(typeof result.executionMeta.endTime).toBe('number');
      expect(typeof result.executionMeta.duration).toBe('number');
      expect(result.executionMeta.duration).toBeGreaterThanOrEqual(0);
    });

    it('should return raw CommandResult structure when handler returns it', async () => {
      const handlerPath = join(testDir, 'command-result-handler.js');
      const handlerCode = `
        export default {
          async execute(ctx, input) {
            return {
              exitCode: 0,
              result: { message: 'success' },
              meta: { custom: 'value' }
            };
          }
        };
      `;
      writeFileSync(handlerPath, handlerCode);

      const descriptor: PluginContextDescriptor = {
        hostType: 'cli',
        pluginId: '@kb-labs/test',
        pluginVersion: '1.0.0',
        requestId: 'req-cmd',
        handlerId: 'test:command',
        permissions: {},
        hostContext: { host: 'cli', argv: [], flags: {} },
      };

      const runResult = await runInProcess({
        descriptor,
        platform: mockPlatform,
        ui: mockUI,
        handlerPath,
        input: {},
        cwd: testDir,
      });

      // Raw CommandResult is in data
      expect(runResult.data).toEqual({
        exitCode: 0,
        result: { message: 'success' },
        meta: { custom: 'value' },
      });

      // CLI host can then wrap this into CommandResultWithMeta
      const cliResult = wrapCliResult(runResult, descriptor);
      expect(cliResult.exitCode).toBe(0);
      expect(cliResult.result).toEqual({ message: 'success' });
      expect(cliResult.meta?.custom).toBe('value');
      expect(cliResult.meta?.pluginId).toBe('@kb-labs/test');
    });

    it('should handle void return (undefined data)', async () => {
      const handlerPath = join(testDir, 'void-handler.js');
      const handlerCode = `
        export default {
          async execute(ctx, input) {
            // No return (void)
          }
        };
      `;
      writeFileSync(handlerPath, handlerCode);

      const descriptor: PluginContextDescriptor = {
        hostType: 'cli',
        pluginId: '@kb-labs/test',
        pluginVersion: '1.0.0',
        requestId: 'req-void',
        permissions: {},
        hostContext: { host: 'cli', argv: [], flags: {} },
      };

      const result = await runInProcess({
        descriptor,
        platform: mockPlatform,
        ui: mockUI,
        handlerPath,
        input: {},
        cwd: testDir,
      });

      expect(result.data).toBeUndefined();
      expect(result.executionMeta).toBeDefined();
      expect(result.executionMeta.pluginId).toBe('@kb-labs/test');
    });

    it('should include tenantId in executionMeta when provided', async () => {
      const handlerPath = join(testDir, 'tenant-handler.js');
      const handlerCode = `
        export default {
          async execute(ctx, input) {
            return { tenant: ctx.tenantId };
          }
        };
      `;
      writeFileSync(handlerPath, handlerCode);

      const descriptor: PluginContextDescriptor = {
        hostType: 'rest',
        pluginId: '@kb-labs/test',
        pluginVersion: '1.0.0',
        requestId: 'req-tenant',
        tenantId: 'acme-corp',
        permissions: {},
        hostContext: { host: 'rest', method: 'GET', path: '/test', query: {}, headers: {}, requestId: 'req-tenant', traceId: 'trace-tenant' },
      };

      const result = await runInProcess({
        descriptor,
        platform: mockPlatform,
        ui: mockUI,
        handlerPath,
        input: {},
        cwd: testDir,
      });

      expect(result.executionMeta.tenantId).toBe('acme-corp');
    });
  });

  describe('runInProcess - Error handling', () => {
    it('should throw PluginError if handler missing execute function', async () => {
      const handlerPath = join(testDir, 'invalid-handler.js');
      const handlerCode = `
        export default {
          // No execute function
          someOtherMethod() {}
        };
      `;
      writeFileSync(handlerPath, handlerCode);

      const descriptor: PluginContextDescriptor = {
        hostType: 'cli',
        pluginId: '@kb-labs/test',
        pluginVersion: '1.0.0',
        requestId: 'req-invalid',
        permissions: {},
        hostContext: { host: 'cli', argv: [], flags: {} },
      };

      await expect(
        runInProcess({
          descriptor,
          platform: mockPlatform,
          ui: mockUI,
          handlerPath,
          input: {},
          cwd: testDir,
        })
      ).rejects.toThrow(PluginError);

      await expect(
        runInProcess({
          descriptor,
          platform: mockPlatform,
          ui: mockUI,
          handlerPath,
          input: {},
          cwd: testDir,
        })
      ).rejects.toThrow(/does not export an execute function/);
    });

    it('should propagate handler errors', async () => {
      const handlerPath = join(testDir, 'error-handler.js');
      const handlerCode = `
        export default {
          async execute(ctx, input) {
            throw new Error('Handler failed intentionally');
          }
        };
      `;
      writeFileSync(handlerPath, handlerCode);

      const descriptor: PluginContextDescriptor = {
        hostType: 'cli',
        pluginId: '@kb-labs/test',
        pluginVersion: '1.0.0',
        requestId: 'req-error',
        permissions: {},
        hostContext: { host: 'cli', argv: [], flags: {} },
      };

      await expect(
        runInProcess({
          descriptor,
          platform: mockPlatform,
          ui: mockUI,
          handlerPath,
          input: {},
          cwd: testDir,
        })
      ).rejects.toThrow('Handler failed intentionally');
    });
  });

  describe('runInProcess - Cleanup handlers', () => {
    it('should execute cleanup handlers after success', async () => {
      const cleanupFlag = join(testDir, 'cleanup-flag.txt');

      const handlerPath = join(testDir, 'cleanup-handler.js');
      const handlerCode = `
        import { writeFileSync } from 'node:fs';

        export default {
          async execute(ctx, input) {
            ctx.api.lifecycle.onCleanup(async () => {
              writeFileSync('${cleanupFlag}', 'cleaned');
            });
            return { registered: true };
          }
        };
      `;
      writeFileSync(handlerPath, handlerCode);

      const descriptor: PluginContextDescriptor = {
        hostType: 'cli',
        pluginId: '@kb-labs/test',
        pluginVersion: '1.0.0',
        requestId: 'req-cleanup',
        permissions: {},
        hostContext: { host: 'cli', argv: [], flags: {} },
      };

      const result = await runInProcess({
        descriptor,
        platform: mockPlatform,
        ui: mockUI,
        handlerPath,
        input: {},
        cwd: testDir,
      });

      expect(result.data).toEqual({ registered: true });
      expect(result.executionMeta).toBeDefined();

      // Cleanup should have run and written file
      const { readFileSync, existsSync } = await import('node:fs');
      expect(existsSync(cleanupFlag)).toBe(true);
      expect(readFileSync(cleanupFlag, 'utf-8')).toBe('cleaned');
    });

    it('should execute cleanup handlers even after error', async () => {
      const cleanupFlag = join(testDir, 'cleanup-error-flag.txt');

      const handlerPath = join(testDir, 'cleanup-error-handler.js');
      const handlerCode = `
        import { writeFileSync } from 'node:fs';

        export default {
          async execute(ctx, input) {
            ctx.api.lifecycle.onCleanup(async () => {
              writeFileSync('${cleanupFlag}', 'cleaned-after-error');
            });
            throw new Error('Handler failed');
          }
        };
      `;
      writeFileSync(handlerPath, handlerCode);

      const descriptor: PluginContextDescriptor = {
        hostType: 'cli',
        pluginId: '@kb-labs/test',
        pluginVersion: '1.0.0',
        requestId: 'req-cleanup-error',
        permissions: {},
        hostContext: { host: 'cli', argv: [], flags: {} },
      };

      await expect(
        runInProcess({
          descriptor,
          platform: mockPlatform,
          ui: mockUI,
          handlerPath,
          input: {},
          cwd: testDir,
        })
      ).rejects.toThrow('Handler failed');

      // Cleanup should have run even after error
      const { readFileSync, existsSync } = await import('node:fs');
      expect(existsSync(cleanupFlag)).toBe(true);
      expect(readFileSync(cleanupFlag, 'utf-8')).toBe('cleaned-after-error');
    });
  });

  describe('runInProcess - Context', () => {
    it('should pass signal to context', async () => {
      const handlerPath = join(testDir, 'signal-handler.js');
      const handlerCode = `
        export default {
          async execute(ctx, input) {
            return { hasSignal: ctx.signal !== undefined };
          }
        };
      `;
      writeFileSync(handlerPath, handlerCode);

      const descriptor: PluginContextDescriptor = {
        hostType: 'cli',
        pluginId: '@kb-labs/test',
        pluginVersion: '1.0.0',
        requestId: 'req-signal',
        permissions: {},
        hostContext: { host: 'cli', argv: [], flags: {} },
      };

      const abortController = new AbortController();
      const result = await runInProcess({
        descriptor,
        platform: mockPlatform,
        ui: mockUI,
        handlerPath,
        input: {},
        signal: abortController.signal,
        cwd: testDir,
      });

      expect(result.data).toEqual({ hasSignal: true });
      expect(result.executionMeta).toBeDefined();
    });

    it('should handle named exports (module with execute function)', async () => {
      const handlerPath = join(testDir, 'named-export-handler.js');
      const handlerCode = `
        // No default export, handler is the module itself
        export async function execute(ctx, input) {
          return { type: 'named' };
        }
      `;
      writeFileSync(handlerPath, handlerCode);

      const descriptor: PluginContextDescriptor = {
        hostType: 'cli',
        pluginId: '@kb-labs/test',
        pluginVersion: '1.0.0',
        requestId: 'req-named',
        permissions: {},
        hostContext: { host: 'cli', argv: [], flags: {} },
      };

      const result = await runInProcess({
        descriptor,
        platform: mockPlatform,
        ui: mockUI,
        handlerPath,
        input: {},
        cwd: testDir,
      });

      expect(result.data).toEqual({ type: 'named' });
      expect(result.executionMeta).toBeDefined();
    });

    it('should provide complete context to handler', async () => {
      const handlerPath = join(testDir, 'context-handler.js');
      const handlerCode = `
        export default {
          async execute(ctx, input) {
            return {
              hasHost: typeof ctx.host === 'string',
              hasRequestId: typeof ctx.requestId === 'string',
              hasUI: ctx.ui !== undefined,
              hasPlatform: ctx.platform !== undefined,
              hasRuntime: ctx.runtime !== undefined,
              hasAPI: ctx.api !== undefined,
              hasTrace: ctx.trace !== undefined,
            };
          }
        };
      `;
      writeFileSync(handlerPath, handlerCode);

      const descriptor: PluginContextDescriptor = {
        hostType: 'cli',
        pluginId: '@kb-labs/test',
        pluginVersion: '1.0.0',
        requestId: 'req-context',
        permissions: {},
        hostContext: { host: 'cli', argv: [], flags: {} },
      };

      const result = await runInProcess({
        descriptor,
        platform: mockPlatform,
        ui: mockUI,
        handlerPath,
        input: {},
        cwd: testDir,
      });

      expect(result.data).toEqual({
        hasHost: true,
        hasRequestId: true,
        hasUI: true,
        hasPlatform: true,
        hasRuntime: true,
        hasAPI: true,
        hasTrace: true,
      });
      expect(result.executionMeta).toBeDefined();
    });
  });

  describe('runInSubprocess', () => {
    it('should find bootstrap.js in dist directory', async () => {
      const { accessSync, constants } = await import('node:fs');
      const { resolve, dirname } = await import('node:path');
      const { fileURLToPath } = await import('node:url');

      // Get the dist directory
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);
      const distDir = resolve(__dirname, '../../dist/sandbox');
      const bootstrapPath = resolve(distDir, 'bootstrap.js');

      // Verify bootstrap.js exists and is readable
      expect(() => {
        accessSync(bootstrapPath, constants.R_OK);
      }).not.toThrow();
    });

    it('should execute handler in subprocess with IPC and metadata injection', async () => {
      // This test requires a UnixSocket server to be running
      // For now, we skip it in unit tests and cover in integration tests
      // where the full CLI environment is available

      // TODO: Create a mock UnixSocket server for unit testing subprocess execution
      expect(true).toBe(true);
    }, { skip: true });

    it('should handle subprocess timeout', async () => {
      // TODO: Create timeout test with mock UnixSocket server
      expect(true).toBe(true);
    }, { skip: true });

    it('should handle abort signal in subprocess', async () => {
      // TODO: Create abort signal test with mock UnixSocket server
      expect(true).toBe(true);
    }, { skip: true });
  });
});
