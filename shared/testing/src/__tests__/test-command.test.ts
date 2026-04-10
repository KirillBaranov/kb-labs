import { describe, it, expect, afterEach, vi } from 'vitest';
import { resetPlatform } from '@kb-labs/core-runtime';
import { testCommand } from '../test-command.js';
import { mockLLM } from '../mock-llm.js';
import { mockCache } from '../mock-cache.js';
import type { PluginContextV3, CommandResult } from '@kb-labs/plugin-contracts';

// ────────────────────────────────────────────────────────────────────
// Test handlers (simulating what plugin authors write)
// ────────────────────────────────────────────────────────────────────

/** Simple CLI command handler (like defineCommand output) */
const greetHandler = {
  async execute(
    ctx: PluginContextV3,
    input: { flags: { name?: string }; argv: string[] }
  ): Promise<CommandResult<{ message: string }>> {
    const name = input.flags.name || 'World';
    ctx.ui.success(`Hello, ${name}!`);
    return { exitCode: 0, result: { message: `Hello, ${name}!` } };
  },
};

/** Handler that returns non-zero exit code */
const failingHandler = {
  async execute(
    ctx: PluginContextV3,
    _input: { flags: Record<string, unknown>; argv: string[] }
  ): Promise<CommandResult> {
    ctx.ui.error('Something went wrong');
    return { exitCode: 1, meta: { reason: 'test-failure' } };
  },
};

/** Handler that uses LLM */
const analyzeHandler = {
  async execute(
    ctx: PluginContextV3,
    input: { flags: { file?: string }; argv: string[] }
  ): Promise<CommandResult<{ analysis: string }>> {
    const file = input.flags.file || 'unknown';
    const response = await ctx.platform.llm.complete(`Analyze ${file}`);
    const analysis = response.content;
    ctx.ui.info(`Analysis for ${file}: ${analysis}`);
    return { exitCode: 0, result: { analysis } };
  },
};

/** Handler that uses cache */
const cachedHandler = {
  async execute(
    ctx: PluginContextV3,
    input: { flags: { key?: string }; argv: string[] }
  ): Promise<CommandResult<{ cached: boolean; value: unknown }>> {
    const key = input.flags.key || 'default';
    const cached = await ctx.platform.cache.get(key);
    if (cached) {
      return { exitCode: 0, result: { cached: true, value: cached } };
    }
    await ctx.platform.cache.set(key, 'computed-value', 60000);
    return { exitCode: 0, result: { cached: false, value: 'computed-value' } };
  },
};

/** REST handler (like defineHandler output) — returns raw data */
const restHandler = {
  async execute(
    ctx: PluginContextV3,
    input: { query?: { workspace?: string }; body?: { name: string } }
  ): Promise<{ workspace: string; name: string }> {
    const workspace = input.query?.workspace || 'root';
    const name = input.body?.name || 'unnamed';
    ctx.ui.info(`Creating in ${workspace}: ${name}`);
    return { workspace, name };
  },
};

/** REST route handler (like defineRoute output) — returns CommandResult */
const routeHandler = {
  async execute(
    ctx: PluginContextV3,
    input: { query?: { id?: string } }
  ): Promise<CommandResult<{ found: boolean }>> {
    const id = input.query?.id;
    if (!id) {
      return { exitCode: 1, result: { found: false } };
    }
    return { exitCode: 0, result: { found: true } };
  },
};

/** Handler that returns void */
const voidHandler = {
  async execute(
    ctx: PluginContextV3,
    _input: { flags: Record<string, unknown>; argv: string[] }
  ): Promise<void> {
    ctx.ui.success('Done!');
  },
};

/** Handler with cleanup */
let cleanupCalled = false;
const handlerWithCleanup = {
  async execute(
    _ctx: PluginContextV3,
    _input: { flags: Record<string, unknown>; argv: string[] }
  ): Promise<CommandResult> {
    return { exitCode: 0 };
  },
  async cleanup() {
    cleanupCalled = true;
  },
};

/** Handler that reads config */
const configHandler = {
  async execute(
    ctx: PluginContextV3<{ apiKey: string; verbose: boolean }>,
    _input: { flags: Record<string, unknown>; argv: string[] }
  ): Promise<CommandResult<{ key: string }>> {
    return { exitCode: 0, result: { key: ctx.config!.apiKey } };
  },
};

/** Handler that throws */
const throwingHandler = {
  async execute(): Promise<CommandResult> {
    throw new Error('Handler crashed');
  },
};

/** Handler that uses meta */
const metaHandler = {
  async execute(
    _ctx: PluginContextV3,
    _input: { flags: Record<string, unknown>; argv: string[] }
  ): Promise<CommandResult<string>> {
    return {
      exitCode: 0,
      result: 'ok',
      meta: { tokens: 150, model: 'gpt-4' },
    };
  },
};

// ────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────

describe('testCommand', () => {
  afterEach(() => {
    resetPlatform();
    cleanupCalled = false;
  });

  // ── Basic CLI ────────────────────────────────────────────────────

  describe('CLI commands', () => {
    it('should execute a simple handler with flags', async () => {
      const result = await testCommand(greetHandler, {
        flags: { name: 'Alice' },
      });
      result.cleanup();

      expect(result.exitCode).toBe(0);
      expect(result.result).toEqual({ message: 'Hello, Alice!' });
      expect(result.ui.success).toHaveBeenCalledWith('Hello, Alice!');
    });

    it('should use default flags when none provided', async () => {
      const result = await testCommand(greetHandler);
      result.cleanup();

      expect(result.exitCode).toBe(0);
      expect(result.result).toEqual({ message: 'Hello, World!' });
    });

    it('should pass argv to handler', async () => {
      const argvCapture: string[] = [];
      const handler = {
        async execute(
          _ctx: PluginContextV3,
          input: { flags: Record<string, unknown>; argv: string[] }
        ): Promise<CommandResult<string[]>> {
          argvCapture.push(...input.argv);
          return { exitCode: 0, result: input.argv };
        },
      };

      const result = await testCommand(handler, {
        argv: ['file1.ts', 'file2.ts'],
      });
      result.cleanup();

      expect(result.result).toEqual(['file1.ts', 'file2.ts']);
    });

    it('should handle non-zero exit code', async () => {
      const result = await testCommand(failingHandler);
      result.cleanup();

      expect(result.exitCode).toBe(1);
      expect(result.ui.error).toHaveBeenCalledWith('Something went wrong');
      expect(result.meta).toEqual({ reason: 'test-failure' });
    });

    it('should handle void return', async () => {
      const result = await testCommand(voidHandler);
      result.cleanup();

      expect(result.exitCode).toBe(0);
      expect(result.result).toBeUndefined();
      expect(result.ui.success).toHaveBeenCalledWith('Done!');
    });
  });

  // ── Platform mocks ──────────────────────────────────────────────

  describe('platform mocks', () => {
    it('should inject LLM mock into context', async () => {
      const llm = mockLLM().onAnyComplete().respondWith('looks great');

      const result = await testCommand(analyzeHandler, {
        flags: { file: 'app.ts' },
        platform: { llm },
      });
      result.cleanup();

      expect(result.exitCode).toBe(0);
      expect(result.result).toEqual({ analysis: 'looks great' });
      expect(llm.complete).toHaveBeenCalled();
      expect(result.ui.info).toHaveBeenCalledWith('Analysis for app.ts: looks great');
    });

    it('should inject cache mock into context', async () => {
      const cache = mockCache();
      await cache.set('my-key', 'pre-cached', 60000);

      const result = await testCommand(cachedHandler, {
        flags: { key: 'my-key' },
        platform: { cache },
      });
      result.cleanup();

      expect(result.exitCode).toBe(0);
      expect(result.result).toEqual({ cached: true, value: 'pre-cached' });
    });

    it('should use default mocks when no platform provided', async () => {
      // analyzeHandler uses llm.complete — default mock returns 'mock response'
      const result = await testCommand(analyzeHandler, {
        flags: { file: 'test.ts' },
      });
      result.cleanup();

      expect(result.exitCode).toBe(0);
      // Default mockLLM returns 'mock response' for complete
      expect(result.result).toEqual({ analysis: 'mock response' });
    });
  });

  // ── REST handlers ──────────────────────────────────────────────

  describe('REST handlers', () => {
    it('should pass query and body for REST host', async () => {
      const result = await testCommand(restHandler, {
        host: 'rest',
        query: { workspace: 'my-project' },
        body: { name: 'release-v2' },
      });
      result.cleanup();

      expect(result.exitCode).toBe(0);
      // restHandler returns raw data (not CommandResult), so it's treated as result
      expect(result.result).toEqual({ workspace: 'my-project', name: 'release-v2' });
      expect(result.ui.info).toHaveBeenCalledWith('Creating in my-project: release-v2');
    });

    it('should handle REST route handler with CommandResult', async () => {
      const result = await testCommand(routeHandler, {
        host: 'rest',
        query: { id: '123' },
      });
      result.cleanup();

      expect(result.exitCode).toBe(0);
      expect(result.result).toEqual({ found: true });
    });

    it('should handle REST route handler failure', async () => {
      const result = await testCommand(routeHandler, {
        host: 'rest',
        // No id — should fail
      });
      result.cleanup();

      expect(result.exitCode).toBe(1);
      expect(result.result).toEqual({ found: false });
    });

    it('should pass params for REST', async () => {
      const paramHandler = {
        async execute(
          _ctx: PluginContextV3,
          input: { params?: { id?: string } }
        ): Promise<CommandResult<string>> {
          return { exitCode: 0, result: input.params?.id || 'none' };
        },
      };

      const result = await testCommand(paramHandler, {
        host: 'rest',
        params: { id: 'abc-123' },
      });
      result.cleanup();

      expect(result.result).toBe('abc-123');
    });
  });

  // ── Raw input ──────────────────────────────────────────────────

  describe('raw input', () => {
    it('should pass raw input directly when provided', async () => {
      const customHandler = {
        async execute(
          _ctx: PluginContextV3,
          input: { custom: string; data: number[] }
        ): Promise<CommandResult<string>> {
          return { exitCode: 0, result: `${input.custom}:${input.data.length}` };
        },
      };

      const result = await testCommand(customHandler, {
        input: { custom: 'hello', data: [1, 2, 3] },
      });
      result.cleanup();

      expect(result.result).toBe('hello:3');
    });

    it('raw input should override flags/argv', async () => {
      const handler = {
        async execute(
          _ctx: PluginContextV3,
          input: unknown
        ): Promise<CommandResult<unknown>> {
          return { exitCode: 0, result: input };
        },
      };

      const result = await testCommand(handler, {
        flags: { shouldBeIgnored: true },
        argv: ['ignored'],
        input: { override: true },
      });
      result.cleanup();

      expect(result.result).toEqual({ override: true });
    });
  });

  // ── Config ─────────────────────────────────────────────────────

  describe('config', () => {
    it('should pass config to context', async () => {
      const result = await testCommand(configHandler, {
        config: { apiKey: 'sk-test-123', verbose: true },
      });
      result.cleanup();

      expect(result.exitCode).toBe(0);
      expect(result.result).toEqual({ key: 'sk-test-123' });
    });
  });

  // ── Metadata ───────────────────────────────────────────────────

  describe('meta', () => {
    it('should return meta from CommandResult', async () => {
      const result = await testCommand(metaHandler);
      result.cleanup();

      expect(result.meta).toEqual({ tokens: 150, model: 'gpt-4' });
    });

    it('should return undefined meta for raw-data handlers', async () => {
      const result = await testCommand(restHandler, {
        host: 'rest',
        body: { name: 'test' },
      });
      result.cleanup();

      expect(result.meta).toBeUndefined();
    });
  });

  // ── Cleanup & lifecycle ────────────────────────────────────────

  describe('cleanup & lifecycle', () => {
    it('should call handler.cleanup() after execute', async () => {
      expect(cleanupCalled).toBe(false);

      const result = await testCommand(handlerWithCleanup);
      result.cleanup();

      expect(cleanupCalled).toBe(true);
    });

    it('should call handler.cleanup() even if execute throws', async () => {
      let cleaned = false;
      const handler = {
        async execute(): Promise<CommandResult> {
          throw new Error('boom');
        },
        async cleanup() {
          cleaned = true;
        },
      };

      await expect(testCommand(handler)).rejects.toThrow('boom');
      expect(cleaned).toBe(true);
    });

    it('should propagate handler errors', async () => {
      await expect(testCommand(throwingHandler)).rejects.toThrow('Handler crashed');
    });
  });

  // ── Context properties ─────────────────────────────────────────

  describe('context properties', () => {
    it('should set host on context', async () => {
      const capturedHost: string[] = [];
      const handler = {
        async execute(ctx: PluginContextV3): Promise<CommandResult> {
          capturedHost.push(ctx.host);
          return { exitCode: 0 };
        },
      };

      const r1 = await testCommand(handler, { host: 'cli' });
      const r2 = await testCommand(handler, { host: 'rest' });
      const r3 = await testCommand(handler, { host: 'workflow' });
      r1.cleanup();
      r2.cleanup();
      r3.cleanup();

      expect(capturedHost).toEqual(['cli', 'rest', 'workflow']);
    });

    it('should expose ctx in result for advanced assertions', async () => {
      const result = await testCommand(greetHandler, {
        flags: { name: 'Bob' },
      });
      result.cleanup();

      expect(result.ctx.host).toBe('cli');
      expect(result.ctx.pluginId).toBe('test-plugin');
      expect(result.ctx.ui).toBe(result.ui);
    });

    it('should pass tenantId to context', async () => {
      const handler = {
        async execute(ctx: PluginContextV3): Promise<CommandResult<string | undefined>> {
          return { exitCode: 0, result: ctx.tenantId };
        },
      };

      const result = await testCommand(handler, { tenantId: 'acme-corp' });
      result.cleanup();

      expect(result.result).toBe('acme-corp');
    });

    it('should pass cwd to context', async () => {
      const handler = {
        async execute(ctx: PluginContextV3): Promise<CommandResult<string>> {
          return { exitCode: 0, result: ctx.cwd };
        },
      };

      const result = await testCommand(handler, { cwd: '/tmp/test-project' });
      result.cleanup();

      expect(result.result).toBe('/tmp/test-project');
    });
  });

  // ── UI spies ───────────────────────────────────────────────────

  describe('UI spies', () => {
    it('should track all UI method calls', async () => {
      const handler = {
        async execute(ctx: PluginContextV3): Promise<CommandResult> {
          ctx.ui.info('step 1');
          ctx.ui.warn('caution');
          ctx.ui.success('done');
          ctx.ui.debug('internal');
          return { exitCode: 0 };
        },
      };

      const result = await testCommand(handler);
      result.cleanup();

      expect(result.ui.info).toHaveBeenCalledWith('step 1');
      expect(result.ui.warn).toHaveBeenCalledWith('caution');
      expect(result.ui.success).toHaveBeenCalledWith('done');
      expect(result.ui.debug).toHaveBeenCalledWith('internal');
    });

    it('should support UI override', async () => {
      const customError = vi.fn();

      const result = await testCommand(failingHandler, {
        ui: { error: customError },
      });
      result.cleanup();

      expect(customError).toHaveBeenCalledWith('Something went wrong');
    });
  });

  // ── raw field ──────────────────────────────────────────────────

  describe('raw return value', () => {
    it('should expose raw return for CommandResult handlers', async () => {
      const result = await testCommand(metaHandler);
      result.cleanup();

      expect(result.raw).toEqual({
        exitCode: 0,
        result: 'ok',
        meta: { tokens: 150, model: 'gpt-4' },
      });
    });

    it('should expose raw return for data-returning handlers', async () => {
      const result = await testCommand(restHandler, {
        host: 'rest',
        body: { name: 'test' },
      });
      result.cleanup();

      expect(result.raw).toEqual({ workspace: 'root', name: 'test' });
    });

    it('should expose null raw for void handlers', async () => {
      const result = await testCommand(voidHandler);
      result.cleanup();

      expect(result.raw).toBeUndefined();
    });
  });
});
