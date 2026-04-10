/**
 * @module @kb-labs/plugin-runtime/__tests__/platform-api-calls
 *
 * E2E tests: handler calls platform API methods (logger, cache, storage, analytics).
 * Verifies that ctx.platform adapters are callable, not just present.
 *
 * Critical path: Plugin → platform API (useLogger, useCache, useStorage).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { runInProcess } from '../sandbox/runner.js';
import type { PluginContextDescriptor } from '@kb-labs/plugin-contracts';
import { createMockUI, createMockPlatform } from './test-mocks.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';

describe('Platform API calls from handler', () => {
  const mockUI = createMockUI();
  const mockPlatform = createMockPlatform();

  let testDir: string;

  const descriptor: PluginContextDescriptor = {
    hostType: 'cli',
    pluginId: '@kb-labs/test-platform',
    pluginVersion: '1.0.0',
    requestId: 'req-platform-api',
    permissions: {},
    hostContext: { host: 'cli', argv: [], flags: {} },
  };

  beforeAll(() => {
    testDir = join(tmpdir(), `platform-api-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterAll(() => {
    try { rmSync(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('handler can call ctx.platform.logger.info without throwing', async () => {
    const handlerPath = join(testDir, 'logger-call.js');
    writeFileSync(handlerPath, `
      export default {
        async execute(ctx, input) {
          ctx.platform.logger.info('handler started', { input });
          ctx.platform.logger.debug('processing');
          ctx.platform.logger.warn('test warning');
          return { logged: true };
        }
      };
    `);

    const result = await runInProcess({
      descriptor,
      platform: mockPlatform,
      ui: mockUI,
      handlerPath,
      input: { value: 42 },
      cwd: testDir,
    });

    expect(result.data).toEqual({ logged: true });
    expect(result.executionMeta.pluginId).toBe('@kb-labs/test-platform');
  });

  it('handler can call ctx.platform.analytics.track without throwing', async () => {
    const handlerPath = join(testDir, 'analytics-call.js');
    writeFileSync(handlerPath, `
      export default {
        async execute(ctx, input) {
          await ctx.platform.analytics.track('command.executed', { pluginId: ctx.pluginId });
          return { tracked: true };
        }
      };
    `);

    const result = await runInProcess({
      descriptor,
      platform: mockPlatform,
      ui: mockUI,
      handlerPath,
      input: {},
      cwd: testDir,
    });

    expect(result.data).toEqual({ tracked: true });
  });

  it('handler can call ctx.platform.eventBus.publish without throwing', async () => {
    const handlerPath = join(testDir, 'eventbus-call.js');
    writeFileSync(handlerPath, `
      export default {
        async execute(ctx, input) {
          await ctx.platform.eventBus.publish('plugin.executed', { source: ctx.pluginId });
          return { published: true };
        }
      };
    `);

    const result = await runInProcess({
      descriptor,
      platform: mockPlatform,
      ui: mockUI,
      handlerPath,
      input: {},
      cwd: testDir,
    });

    expect(result.data).toEqual({ published: true });
  });

  it('handler can call ctx.ui methods without throwing', async () => {
    const handlerPath = join(testDir, 'ui-calls.js');
    writeFileSync(handlerPath, `
      export default {
        async execute(ctx, input) {
          ctx.ui.info('Processing...');
          ctx.ui.success('Done!');
          ctx.ui.warn('Watch out');
          ctx.ui.error('Oops');
          return { uiCalled: true };
        }
      };
    `);

    const result = await runInProcess({
      descriptor,
      platform: mockPlatform,
      ui: mockUI,
      handlerPath,
      input: {},
      cwd: testDir,
    });

    expect(result.data).toEqual({ uiCalled: true });
  });

  it('handler can read ctx.requestId and ctx.pluginId', async () => {
    const handlerPath = join(testDir, 'meta-read.js');
    writeFileSync(handlerPath, `
      export default {
        async execute(ctx, input) {
          return {
            requestId: ctx.requestId,
            pluginId: ctx.pluginId,
            host: ctx.host,
          };
        }
      };
    `);

    const result = await runInProcess({
      descriptor,
      platform: mockPlatform,
      ui: mockUI,
      handlerPath,
      input: {},
      cwd: testDir,
    });

    expect(result.data).toMatchObject({
      pluginId: '@kb-labs/test-platform',
      host: 'cli',
    });
    expect(typeof (result.data as any).requestId).toBe('string');
  });

  it('handler receives input and returns data correctly', async () => {
    const handlerPath = join(testDir, 'echo.js');
    writeFileSync(handlerPath, `
      export default {
        async execute(ctx, input) {
          return { echo: input, count: Object.keys(input).length };
        }
      };
    `);

    const input = { name: 'test', value: 123, flag: true };
    const result = await runInProcess({
      descriptor,
      platform: mockPlatform,
      ui: mockUI,
      handlerPath,
      input,
      cwd: testDir,
    });

    expect(result.data).toEqual({ echo: input, count: 3 });
    expect(result.executionMeta.duration).toBeGreaterThanOrEqual(0);
  });

  it('executionMeta contains all required fields', async () => {
    const handlerPath = join(testDir, 'noop.js');
    writeFileSync(handlerPath, `
      export default { async execute() { return null; } };
    `);

    const result = await runInProcess({
      descriptor,
      platform: mockPlatform,
      ui: mockUI,
      handlerPath,
      input: {},
      cwd: testDir,
    });

    const meta = result.executionMeta;
    expect(meta.pluginId).toBe('@kb-labs/test-platform');
    expect(meta.pluginVersion).toBe('1.0.0');
    expect(typeof meta.requestId).toBe('string');
    expect(typeof meta.duration).toBe('number');
    expect(typeof meta.startTime).toBe('number');
  });
});
