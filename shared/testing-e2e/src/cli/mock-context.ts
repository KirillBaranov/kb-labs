/**
 * @module mock-context
 *
 * Lightweight PluginContextV3 factory for CLI handler tests.
 *
 * Intentionally self-contained — no dependency on @kb-labs/shared-testing
 * or any workspace package beyond plugin-contracts. This keeps the packed
 * tgz usable in isolated e2e environments.
 *
 * Platform, runtime and api fields are minimal vi.fn() stubs covering the
 * subset of APIs that CLI command handlers realistically call. Commands that
 * need richer mocks (LLM, vector store, etc.) should use createTestContext()
 * from @kb-labs/shared-testing directly.
 */

import { vi } from 'vitest';
import { noopUI } from '@kb-labs/plugin-contracts';
import type { PluginContextV3, UIFacade } from '@kb-labs/plugin-contracts';

export interface MockContextOptions {
  /** Override specific UIFacade methods (merged with noopUI). */
  ui?: Partial<UIFacade>;
  /** Working directory (default: process.cwd()) */
  cwd?: string;
  /** Plugin id for trace context */
  pluginId?: string;
}

/**
 * Creates a minimal PluginContextV3 for CLI handler tests.
 *
 * - ui: combined with noopUI so all methods are safe to call
 * - platform.logger: vi.fn() stubs (info/warn/error/debug/child)
 * - runtime.fs: vi.fn() stubs for common FS operations
 * - runtime.fetch / runtime.env: vi.fn() stubs
 * - api: vi.fn() stubs for lifecycle and state
 *
 * Use with createCapturedUI() to assert on command output:
 * ```typescript
 * const { ui, captured } = createCapturedUI();
 * const ctx = createMockContext({ ui });
 * ```
 */
export function createMockContext(opts: MockContextOptions = {}): PluginContextV3 {
  const ui: UIFacade = opts.ui ? { ...noopUI, ...opts.ui } : noopUI;

  // Minimal logger stub — commands may call ctx.platform.logger.*
  const noopLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  };

  // Minimal platform — only logger is wired; everything else is an empty stub.
  // CLI commands that need LLM/cache/storage should use @kb-labs/shared-testing.
  const platform = {
    logger: noopLogger,
  } as unknown as PluginContextV3['platform'];

  // Minimal runtime — covers fs.glob / fs.readFile used by some commands (e.g. review)
  const runtime = {
    fs: {
      readFile: vi.fn(async () => ''),
      readFileBuffer: vi.fn(async () => new Uint8Array()),
      writeFile: vi.fn(async () => {}),
      readdir: vi.fn(async () => []),
      readdirWithStats: vi.fn(async () => []),
      mkdir: vi.fn(async () => {}),
      rm: vi.fn(async () => {}),
      copy: vi.fn(async () => {}),
      move: vi.fn(async () => {}),
      glob: vi.fn(async () => []),
      stat: vi.fn(async () => ({ isFile: () => false, isDirectory: () => false, size: 0, mtime: 0, ctime: 0 })),
      exists: vi.fn(async () => false),
      resolve: (p: string) => p,
      relative: (p: string) => p,
      join: (...s: string[]) => s.join('/'),
      dirname: (p: string) => p.split('/').slice(0, -1).join('/'),
      basename: (p: string) => p.split('/').pop() ?? '',
      extname: (p: string) => { const b = p.split('/').pop() ?? ''; const i = b.lastIndexOf('.'); return i > 0 ? b.slice(i) : ''; },
    },
    fetch: vi.fn(async () => new Response('mock')),
    env: vi.fn((_key: string) => undefined),
  } as unknown as PluginContextV3['runtime'];

  // Minimal api — covers the lifecycle and state methods most commands might call
  const api = {
    lifecycle: { onCleanup: vi.fn() },
    state: {
      get: vi.fn(async () => undefined),
      set: vi.fn(async () => {}),
      delete: vi.fn(async () => {}),
      has: vi.fn(async () => false),
    },
    shell: { exec: vi.fn(async () => ({ code: 0, stdout: '', stderr: '', ok: true })) },
    events: { emit: vi.fn(async () => {}) },
  } as unknown as PluginContextV3['api'];

  return {
    host: 'cli',
    requestId: 'test-request-id',
    pluginId: opts.pluginId ?? 'test-plugin',
    pluginVersion: '0.0.0',
    cwd: opts.cwd ?? process.cwd(),
    trace: {
      traceId: 'test-trace-id',
      spanId: 'test-span-id',
      parentSpanId: undefined,
      addEvent: () => {},
      setAttribute: () => {},
      recordError: () => {},
    },
    hostContext: { host: 'cli', argv: [] } as unknown as PluginContextV3['hostContext'],
    ui,
    platform,
    runtime,
    api,
  };
}
