/**
 * @module @kb-labs/shared-command-kit/__tests__/plugin-context-v3-snapshot
 *
 * Snapshot test to ensure PluginContextV3 structure remains stable.
 * This test validates that system commands receive ONLY PluginContextV3 fields,
 * without any legacy EnhancedCliContext fields (tracker, success, error, etc.).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { defineSystemCommand } from '../define-system-command';
import type { PluginContextV3, PlatformServices } from '@kb-labs/plugin-contracts';

describe('PluginContextV3 Structure Snapshot', () => {
  let mockCtx: PluginContextV3;

  beforeEach(() => {
    // Pure PluginContextV3 - no EnhancedCliContext, no tracker, no output helpers
    mockCtx = {
      host: 'cli',
      requestId: 'test-request-id',
      pluginId: '@kb-labs/system',
      pluginVersion: '0.1.0',
      cwd: '/test',
      hostContext: { host: 'cli', argv: [], flags: {} },
      ui: {
        colors: {} as any,
        symbols: {} as any,
        write: vi.fn(),
        json: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
        success: vi.fn(),
        warn: vi.fn(),
        warning: vi.fn(),
        message: vi.fn(),
        table: vi.fn(),
        keyValue: vi.fn(),
        list: vi.fn(),
        confirm: vi.fn(),
        prompt: vi.fn(),
      } as any,
      platform: {
        logger: {
          info: vi.fn(),
          error: vi.fn(),
          warn: vi.fn(),
          debug: vi.fn(),
        } as any,
        llm: {} as any,
        embeddings: {} as any,
        vectorStore: {} as any,
        cache: {} as any,
        storage: {} as any,
        analytics: {} as any,
        eventBus: {} as any,
        logs: {} as any,
        config: {} as any,
        invoke: {} as PlatformServices['invoke'],
        sqlDatabase: {} as any,
        documentDatabase: {} as PlatformServices['documentDatabase'],
      },
      runtime: {
        fs: {} as any,
        fetch: vi.fn(),
        env: {} as any,
      },
      api: {} as any,
      trace: {
        traceId: 'test-trace-id',
        spanId: 'test-span-id',
        addEvent: vi.fn(),
        setAttribute: vi.fn(),
        recordError: vi.fn(),
      },
    };
  });

  it('should have ONLY PluginContextV3 fields (snapshot)', async () => {
    const handler = vi.fn(async (ctx: PluginContextV3) => {
      // Capture context structure
      const contextKeys = Object.keys(ctx).sort();

      // Snapshot the structure
      expect(contextKeys).toMatchInlineSnapshot(`
        [
          "api",
          "cwd",
          "host",
          "platform",
          "pluginId",
          "requestId",
          "runtime",
          "trace",
          "ui",
        ]
      `);

      return { ok: true };
    });

    const command = defineSystemCommand({
      name: 'test',
      description: 'Test',
      flags: {},
      handler,
    });

    await command.run(mockCtx, [], {});

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'cli',
        pluginId: '@kb-labs/system',
        ui: expect.any(Object),
        platform: expect.any(Object),
        runtime: expect.any(Object),
        trace: expect.any(Object),
      }),
      [],
      {}
    );
  });

  it('should NOT have legacy EnhancedCliContext fields', async () => {
    const handler = vi.fn(async (ctx: any) => {
      // Verify no legacy fields
      expect(ctx.tracker).toBeUndefined();
      expect(ctx.success).toBeUndefined();
      expect(ctx.error).toBeUndefined();
      expect(ctx.warning).toBeUndefined();
      expect(ctx.info).toBeUndefined();
      expect(ctx.result).toBeUndefined();

      return { ok: true };
    });

    const command = defineSystemCommand({
      name: 'test',
      description: 'Test',
      flags: {},
      handler,
    });

    await command.run(mockCtx, [], {});

    expect(handler).toHaveBeenCalled();
  });

  it('should have ui field with all required methods (snapshot)', async () => {
    const handler = vi.fn(async (ctx: PluginContextV3) => {
      const uiMethods = Object.keys(ctx.ui!).sort();

      // Snapshot UI methods
      expect(uiMethods).toMatchInlineSnapshot(`
        [
          "colors",
          "completeProgress",
          "confirm",
          "error",
          "failProgress",
          "info",
          "json",
          "keyValue",
          "list",
          "prompt",
          "startProgress",
          "success",
          "table",
          "updateProgress",
          "warn",
          "write",
        ]
      `);

      return { ok: true };
    });

    const command = defineSystemCommand({
      name: 'test',
      description: 'Test',
      flags: {},
      handler,
    });

    await command.run(mockCtx, [], {});
  });

  it('should have platform field with all required services (snapshot)', async () => {
    const handler = vi.fn(async (ctx: PluginContextV3) => {
      const platformServices = Object.keys(ctx.platform).sort();

      // Snapshot platform services
      expect(platformServices).toMatchInlineSnapshot(`
        [
          "analytics",
          "cache",
          "embeddings",
          "llm",
          "logger",
          "storage",
          "vectorStore",
        ]
      `);

      return { ok: true };
    });

    const command = defineSystemCommand({
      name: 'test',
      description: 'Test',
      flags: {},
      handler,
    });

    await command.run(mockCtx, [], {});
  });

  it('should have runtime field with all required methods (snapshot)', async () => {
    const handler = vi.fn(async (ctx: PluginContextV3) => {
      const runtimeMethods = Object.keys(ctx.runtime).sort();

      // Snapshot runtime methods
      expect(runtimeMethods).toMatchInlineSnapshot(`
        [
          "env",
          "fetch",
          "fs",
          "state",
        ]
      `);

      return { ok: true };
    });

    const command = defineSystemCommand({
      name: 'test',
      description: 'Test',
      flags: {},
      handler,
    });

    await command.run(mockCtx, [], {});
  });
});
