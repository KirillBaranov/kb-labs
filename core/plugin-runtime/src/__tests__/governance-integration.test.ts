/**
 * Handler-level governance integration tests.
 *
 * Tests run real plugin handlers via runInProcess() with a governed platform.
 * Verifies that permission enforcement works end-to-end: from plugin manifest
 * permissions → applyPluginGovernance() → handler calling ctx.platform.*.
 *
 * This is the "handler" level of the test pyramid — exercises real context
 * creation and governance, not just the wrap functions in isolation.
 */

import type { vi} from 'vitest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { runInProcess } from '../sandbox/runner.js';
import type { PluginContextDescriptor } from '@kb-labs/plugin-contracts';
import { createMockUI, createMockPlatform } from './test-mocks.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';

const mockUI = createMockUI();

let testDir: string;

beforeAll(() => {
  testDir = join(tmpdir(), `governance-test-${Date.now()}`);
  mkdirSync(testDir, { recursive: true });
});

afterAll(() => {
  try { rmSync(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
});

function makeHandler(name: string, code: string): string {
  const p = join(testDir, `${name}.mjs`);
  writeFileSync(p, code);
  return p;
}

function makeDescriptor(pluginId: string, permissions: object): PluginContextDescriptor {
  return {
    hostType: 'cli',
    pluginId,
    pluginVersion: '1.0.0',
    requestId: `req-${pluginId}`,
    permissions,
    hostContext: { host: 'cli', argv: [], flags: {} },
  };
}

// ─── LLM permission enforcement ──────────────────────────────────────────────

describe('LLM governance via runInProcess', () => {
  it('PermissionError propagates to handler when llm permission is false', async () => {
    const platform = createMockPlatform();
    const path = makeHandler('llm-denied', `
      export default {
        async execute(ctx) {
          try {
            ctx.platform.llm.complete;
            return { denied: false };
          } catch (e) {
            return { denied: true, name: e.name };
          }
        }
      };
    `);

    const result = await runInProcess({
      descriptor: makeDescriptor('test-llm-denied', { platform: { llm: false } }),
      platform, ui: mockUI, handlerPath: path, input: {}, cwd: testDir,
    });

    expect(result.data).toMatchObject({ denied: true });
  });

  it('LLM call succeeds when permission is true', async () => {
    const platform = createMockPlatform();
    (platform.llm.complete as ReturnType<typeof vi.fn>).mockResolvedValue({
      content: 'hello from llm',
      usage: { promptTokens: 5, completionTokens: 3 },
      model: 'test',
    });

    const path = makeHandler('llm-allowed', `
      export default {
        async execute(ctx) {
          const result = await ctx.platform.llm.complete('test prompt');
          return { content: result.content };
        }
      };
    `);

    const result = await runInProcess({
      descriptor: makeDescriptor('test-llm-allowed', { platform: { llm: true } }),
      platform, ui: mockUI, handlerPath: path, input: {}, cwd: testDir,
    });

    expect(result.data).toMatchObject({ content: 'hello from llm' });
  });

  it('model allowlist enforcement — disallowed model throws in handler', async () => {
    const platform = createMockPlatform();

    const path = makeHandler('llm-model-denied', `
      export default {
        async execute(ctx) {
          try {
            await ctx.platform.llm.complete('prompt', { model: 'gpt-4o' });
            return { denied: false };
          } catch (e) {
            return { denied: true, message: e.message };
          }
        }
      };
    `);

    const result = await runInProcess({
      descriptor: makeDescriptor('test-llm-model', { platform: { llm: { models: ['gpt-4o-mini'] } } }),
      platform, ui: mockUI, handlerPath: path, input: {}, cwd: testDir,
    });

    expect(result.data).toMatchObject({ denied: true });
  });
});

// ─── Cache namespace enforcement ─────────────────────────────────────────────

describe('Cache governance via runInProcess', () => {
  it('cache.get denied when no cache permission', async () => {
    const platform = createMockPlatform();

    const path = makeHandler('cache-denied', `
      export default {
        async execute(ctx) {
          try {
            ctx.platform.cache.get;
            return { denied: false };
          } catch (e) {
            return { denied: true };
          }
        }
      };
    `);

    const result = await runInProcess({
      descriptor: makeDescriptor('test-cache-denied', { platform: {} }),
      platform, ui: mockUI, handlerPath: path, input: {}, cwd: testDir,
    });

    expect(result.data).toMatchObject({ denied: true });
  });

  it('cache namespace enforced — access outside prefix throws, inside succeeds', async () => {
    const platform = createMockPlatform();
    (platform.cache.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const path = makeHandler('cache-namespace', `
      export default {
        async execute(ctx) {
          const results = [];
          try {
            await ctx.platform.cache.get('other:key');
            results.push('other:allowed');
          } catch (e) {
            results.push('other:denied');
          }
          try {
            await ctx.platform.cache.get('ns:key');
            results.push('ns:allowed');
          } catch (e) {
            results.push('ns:denied');
          }
          return { results };
        }
      };
    `);

    const result = await runInProcess({
      descriptor: makeDescriptor('test-cache-ns', { platform: { cache: ['ns:'] } }),
      platform, ui: mockUI, handlerPath: path, input: {}, cwd: testDir,
    });

    const data = result.data as { results: string[] };
    expect(data?.results).toContain('other:denied');
    expect(data?.results).toContain('ns:allowed');
  });
});

// ─── Logger scoped to pluginId ────────────────────────────────────────────────

describe('Logger governance via runInProcess', () => {
  it('logger.child is called with pluginId during context setup', async () => {
    const platform = createMockPlatform();

    const path = makeHandler('logger-check', `
      export default {
        async execute(ctx) {
          ctx.platform.logger.info('test');
          return { ok: true };
        }
      };
    `);

    await runInProcess({
      descriptor: makeDescriptor('my-test-plugin', {}),
      platform, ui: mockUI, handlerPath: path, input: {}, cwd: testDir,
    });

    expect(platform.logger.child).toHaveBeenCalledWith(
      expect.objectContaining({ plugin: 'my-test-plugin' })
    );
  });
});
