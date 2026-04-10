/**
 * @module cli-commands/__tests__/hello
 *
 * Unit tests for the `hello` command.
 * Verifies that running `kb hello` prints "Hello World".
 */

import { describe, it, expect, vi } from 'vitest';
import { hello } from '../commands/system/hello.js';
import { noopUI, noopTraceContext } from '@kb-labs/plugin-contracts';
import type { PluginContextV3 } from '@kb-labs/plugin-contracts';

/** Minimal mock platform suitable for system command tests */
function makeMockPlatform() {
  return {
    logger: {
      trace: vi.fn(),
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      fatal: vi.fn(),
      child: vi.fn().mockReturnThis(),
    },
    llm: {} as any,
    embeddings: {} as any,
    vectorStore: {} as any,
    cache: {} as any,
    storage: {} as any,
    analytics: {} as any,
    eventBus: { publish: vi.fn(async () => {}), subscribe: vi.fn(() => () => {}) },
    logs: {} as any,
  };
}

/** Build a PluginContextV3 with a spy on ui.write */
function makeContext(writeSpy: ReturnType<typeof vi.fn>): PluginContextV3 {
  return {
    host: 'cli',
    requestId: 'test-request-id',
    pluginId: '@kb-labs/system',
    pluginVersion: '1.0.0',
    cwd: process.cwd(),
    ui: { ...noopUI, write: writeSpy },
    platform: makeMockPlatform() as any,
    runtime: { fs: {} as any, fetch: vi.fn(), env: vi.fn() },
    api: {} as any,
    hostContext: { host: 'cli' as const, argv: [], flags: {} },
    trace: noopTraceContext,
  };
}

describe('hello command', () => {
  it('has the correct command name', () => {
    expect(hello.name).toBe('hello');
  });

  it('has a description mentioning "Hello World"', () => {
    // defineSystemCommand maps `description` → `describe` on the returned Command
    expect(hello.describe).toMatch(/Hello World/i);
  });

  it('prints "Hello World" to stdout', async () => {
    const writeSpy = vi.fn();
    const ctx = makeContext(writeSpy);

    const exitCode = await hello.run(ctx, [], { json: false });

    expect(writeSpy).toHaveBeenCalledOnce();
    expect(writeSpy).toHaveBeenCalledWith('Hello World\n');
    expect(exitCode).toBe(0);
  });

  it('outputs JSON when --json flag is set', async () => {
    const jsonSpy = vi.fn();
    const writeSpy = vi.fn();
    const ctx = { ...makeContext(writeSpy), ui: { ...noopUI, write: writeSpy, json: jsonSpy } };

    const exitCode = await hello.run(ctx, [], { json: true });

    expect(writeSpy).not.toHaveBeenCalled();
    expect(jsonSpy).toHaveBeenCalledOnce();
    expect(jsonSpy).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Hello World' }),
    );
    expect(exitCode).toBe(0);
  });
});
