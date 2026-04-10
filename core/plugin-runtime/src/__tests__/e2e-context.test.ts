/**
 * @module @kb-labs/plugin-runtime/__tests__/e2e-context
 *
 * E2E tests that verify context structure in real subprocess execution.
 *
 * These tests run actual handlers in subprocesses to verify the complete
 * production pipeline works correctly.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { runInProcess } from '../sandbox/runner.js';
import { wrapCliResult } from '../host/cli-wrapper.js';
import type { PluginContextDescriptor, CommandResult } from '@kb-labs/plugin-contracts';
import { createMockUI, createMockPlatform } from './test-mocks.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';

describe('E2E Context Tests', () => {
  const mockUI = createMockUI();
  const mockPlatform = createMockPlatform();

  let testDir: string;

  beforeAll(() => {
    testDir = join(tmpdir(), `v3-e2e-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterAll(() => {
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should provide complete context in real execution', async () => {
    const handlerPath = join(testDir, 'context-check.js');
    const handlerCode = `
      export default {
        async execute(ctx, input) {
          return {
            exitCode: 0,
            result: {
              hasHost: typeof ctx.host === 'string',
              hasRequestId: typeof ctx.requestId === 'string',
              hasUI: ctx.ui !== undefined,
              hasPlatform: ctx.platform !== undefined,
              hasRuntime: ctx.runtime !== undefined,
              hasAPI: ctx.api !== undefined,
              hasTrace: ctx.trace !== undefined,
              host: ctx.host,
              requestId: ctx.requestId,
            },
          };
        }
      };
    `;
    writeFileSync(handlerPath, handlerCode);

    const descriptor: PluginContextDescriptor = {
      hostType: 'cli',
      pluginId: '@kb-labs/test',
      pluginVersion: '1.0.0',
      requestId: 'e2e-test-123',
      permissions: {},
      hostContext: { host: 'cli', argv: [], flags: {} },
    };

    const runResult = await runInProcess<CommandResult<unknown>>({
      descriptor,
      platform: mockPlatform,
      ui: mockUI,
      handlerPath,
      input: {},
      cwd: testDir,
    });

    // Wrap into CLI format for assertion
    const result = wrapCliResult(runResult, descriptor);

    expect(result.exitCode).toBe(0);
    expect(result.result).toMatchObject({
      hasHost: true,
      hasRequestId: true,
      hasUI: true,
      hasPlatform: true,
      hasRuntime: true,
      hasAPI: true,
      hasTrace: true,
      host: 'cli',
    });
    expect(typeof (result.result as any).requestId).toBe('string');
    expect((result.result as any).requestId.length).toBeGreaterThan(0);

    // Verify metadata auto-injection
    expect(result.meta).toBeDefined();
    expect(result.meta?.executedAt).toBeDefined();
    expect(result.meta?.duration).toBeDefined();
  });

  it('should provide working fs.exists in execution', async () => {
    const handlerPath = join(testDir, 'fs-check.js');
    const handlerCode = `
      export default {
        async execute(ctx, input) {
          // Check if fs.exists is a function
          const hasExistsMethod = typeof ctx.runtime.fs.exists === 'function';
          return {
            exitCode: 0,
            result: {
              hasExistsMethod,
              hasFsAPI: ctx.runtime.fs !== undefined,
            },
          };
        }
      };
    `;
    writeFileSync(handlerPath, handlerCode);

    const descriptor: PluginContextDescriptor = {
      hostType: 'cli',
      pluginId: '@kb-labs/test',
      pluginVersion: '1.0.0',
      requestId: 'e2e-fs-test',
      permissions: {},
      hostContext: { host: 'cli', argv: [], flags: {} },
    };

    const runResult = await runInProcess<CommandResult<unknown>>({
      descriptor,
      platform: mockPlatform,
      ui: mockUI,
      handlerPath,
      input: {},
      cwd: testDir,
    });

    const result = wrapCliResult(runResult, descriptor);

    expect(result.exitCode).toBe(0);
    expect(result.result).toEqual({
      hasExistsMethod: true,
      hasFsAPI: true,
    });
  });

  it('should provide working trace API', async () => {
    const handlerPath = join(testDir, 'trace-check.js');
    const handlerCode = `
      export default {
        async execute(ctx, input) {
          return {
            exitCode: 0,
            result: {
              hasTraceId: typeof ctx.trace.traceId === 'string',
              hasSpanId: typeof ctx.trace.spanId === 'string',
              traceIdLength: ctx.trace.traceId.length,
              spanIdLength: ctx.trace.spanId.length,
            },
          };
        }
      };
    `;
    writeFileSync(handlerPath, handlerCode);

    const descriptor: PluginContextDescriptor = {
      hostType: 'cli',
      pluginId: '@kb-labs/test',
      pluginVersion: '1.0.0',
      requestId: 'e2e-trace-test',
      permissions: {},
      hostContext: { host: 'cli', argv: [], flags: {} },
    };

    const runResult = await runInProcess<CommandResult<unknown>>({
      descriptor,
      platform: mockPlatform,
      ui: mockUI,
      handlerPath,
      input: {},
      cwd: testDir,
    });

    const result = wrapCliResult(runResult, descriptor);

    expect(result.exitCode).toBe(0);
    expect(result.result).toMatchObject({
      hasTraceId: true,
      hasSpanId: true,
    });
    expect((result.result as any).traceIdLength).toBeGreaterThan(0);
    expect((result.result as any).spanIdLength).toBeGreaterThan(0);
  });

  it('should handle handler execution and exit code correctly', async () => {
    const handlerPath = join(testDir, 'exit-code-check.js');
    const handlerCode = `
      export default {
        async execute(ctx, input) {
          return {
            exitCode: 42,
            result: { custom: 'data' },
          };
        }
      };
    `;
    writeFileSync(handlerPath, handlerCode);

    const descriptor: PluginContextDescriptor = {
      hostType: 'cli',
      pluginId: '@kb-labs/test',
      pluginVersion: '1.0.0',
      requestId: 'e2e-exit-test',
      permissions: {},
      hostContext: { host: 'cli', argv: [], flags: {} },
    };

    const runResult = await runInProcess<CommandResult<unknown>>({
      descriptor,
      platform: mockPlatform,
      ui: mockUI,
      handlerPath,
      input: {},
      cwd: testDir,
    });

    const result = wrapCliResult(runResult, descriptor);

    expect(result.exitCode).toBe(42);
    expect(result.result).toEqual({ custom: 'data' });
    expect(result.meta).toBeDefined();
  });

  it('should provide working platform services (llm, logger, etc.)', async () => {
    const handlerPath = join(testDir, 'platform-check.js');
    const handlerCode = `
      export default {
        async execute(ctx, input) {
          return {
            exitCode: 0,
            result: {
              hasLLM: ctx.platform.llm !== undefined,
              hasLogger: ctx.platform.logger !== undefined,
              hasEmbeddings: ctx.platform.embeddings !== undefined,
              hasVectorStore: ctx.platform.vectorStore !== undefined,
              hasCache: ctx.platform.cache !== undefined,
              hasStorage: ctx.platform.storage !== undefined,
              hasAnalytics: ctx.platform.analytics !== undefined,
            },
          };
        }
      };
    `;
    writeFileSync(handlerPath, handlerCode);

    const descriptor: PluginContextDescriptor = {
      hostType: 'cli',
      pluginId: '@kb-labs/test',
      pluginVersion: '1.0.0',
      requestId: 'e2e-platform-test',
      permissions: {},
      hostContext: { host: 'cli', argv: [], flags: {} },
    };

    const runResult = await runInProcess<CommandResult<unknown>>({
      descriptor,
      platform: mockPlatform,
      ui: mockUI,
      handlerPath,
      input: {},
      cwd: testDir,
    });

    const result = wrapCliResult(runResult, descriptor);

    expect(result.exitCode).toBe(0);
    expect(result.result).toEqual({
      hasLLM: true,
      hasLogger: true,
      hasEmbeddings: true,
      hasVectorStore: true,
      hasCache: true,
      hasStorage: true,
      hasAnalytics: true,
    });
  });

  it('should provide ui.colors and ui.write APIs', async () => {
    const handlerPath = join(testDir, 'ui-api-check.js');
    const handlerCode = `
      export default {
        async execute(ctx, input) {
          // Check colors API
          const hasColors = ctx.ui.colors !== undefined;
          const hasSuccessColor = typeof ctx.ui.colors?.success === 'function';
          const hasErrorColor = typeof ctx.ui.colors?.error === 'function';
          const hasPrimaryColor = typeof ctx.ui.colors?.primary === 'function';
          const hasAccentColor = typeof ctx.ui.colors?.accent === 'function';
          const hasBoldColor = typeof ctx.ui.colors?.bold === 'function';

          // Check write method
          const hasWrite = typeof ctx.ui.write === 'function';

          // Test that colors work
          const coloredText = ctx.ui.colors.success('test');
          const colorsWork = typeof coloredText === 'string';

          return {
            exitCode: 0,
            result: {
              hasColors,
              hasSuccessColor,
              hasErrorColor,
              hasPrimaryColor,
              hasAccentColor,
              hasBoldColor,
              hasWrite,
              colorsWork,
            },
          };
        }
      };
    `;
    writeFileSync(handlerPath, handlerCode);

    const descriptor: PluginContextDescriptor = {
      hostType: 'cli',
      pluginId: '@kb-labs/test',
      pluginVersion: '1.0.0',
      requestId: 'e2e-ui-api-test',
      permissions: {},
      hostContext: { host: 'cli', argv: [], flags: {} },
    };

    const runResult = await runInProcess<CommandResult<unknown>>({
      descriptor,
      platform: mockPlatform,
      ui: mockUI,
      handlerPath,
      input: {},
      cwd: testDir,
    });

    const result = wrapCliResult(runResult, descriptor);

    expect(result.exitCode).toBe(0);
    expect(result.result).toEqual({
      hasColors: true,
      hasSuccessColor: true,
      hasErrorColor: true,
      hasPrimaryColor: true,
      hasAccentColor: true,
      hasBoldColor: true,
      hasWrite: true,
      colorsWork: true,
    });
  });
});
