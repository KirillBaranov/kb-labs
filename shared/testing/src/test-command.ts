/**
 * @module @kb-labs/shared-testing/test-command
 *
 * Single-function test runner for plugin command handlers.
 *
 * Eliminates boilerplate: no manual context creation, no descriptor setup,
 * no mock wiring. Import your handler, call testCommand(), assert on result.
 *
 * @example
 * ```typescript
 * import { testCommand, mockLLM } from '@kb-labs/shared-testing';
 * import handler from '../src/commands/greet.js';
 *
 * it('greets the user', async () => {
 *   const result = await testCommand(handler, {
 *     flags: { name: 'Alice' },
 *   });
 *
 *   expect(result.exitCode).toBe(0);
 *   expect(result.result).toEqual({ message: 'Hello, Alice!' });
 *   expect(result.ui.success).toHaveBeenCalledWith('Hello, Alice!');
 * });
 * ```
 */

import type {
  PluginContextV3,
  CommandResult,
  UIFacade,
  PlatformServices,
} from '@kb-labs/plugin-contracts';

import {
  createTestContext,
  type CreateTestContextOptions,
} from './create-test-context.js';

// ────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────

/**
 * Any handler that has an execute(ctx, input) method.
 * Covers CommandHandlerV3, RouteHandler, Handler, and raw objects.
 */
export interface TestableHandler<TConfig = unknown, TInput = unknown, TResult = unknown> {
  execute(
    context: PluginContextV3<TConfig>,
    input: TInput
  ): Promise<TResult> | TResult;
  cleanup?(): Promise<void> | void;
}

/**
 * Options for testCommand().
 *
 * Provide only what you need — everything else gets sensible defaults.
 */
export interface TestCommandOptions<TConfig = unknown> {
  // ── Input ──────────────────────────────────────────────────────

  /** CLI flags (sugar for input: { flags, argv }) */
  flags?: Record<string, unknown>;

  /** CLI positional arguments (default: []) */
  argv?: string[];

  /** REST query params (sugar for input: { query }) */
  query?: Record<string, unknown>;

  /** REST request body (sugar for input: { body }) */
  body?: unknown;

  /** REST route params (sugar for input: { params }) */
  params?: Record<string, unknown>;

  /**
   * Raw input object. If provided, flags/argv/query/body/params are ignored.
   * Use this when your handler expects a custom input shape.
   */
  input?: unknown;

  // ── Context ────────────────────────────────────────────────────

  /** Host type (default: 'cli') */
  host?: 'cli' | 'rest' | 'workflow' | 'webhook';

  /** Plugin config passed as ctx.config */
  config?: TConfig;

  /** Working directory (default: process.cwd()) */
  cwd?: string;

  /** Tenant ID */
  tenantId?: string;

  /** Abort signal */
  signal?: AbortSignal;

  // ── Mocks ──────────────────────────────────────────────────────

  /** Override platform services (e.g., { llm: mockLLM().onAnyComplete().respondWith('ok') }) */
  platform?: Partial<PlatformServices>;

  /** Override UI facade (individual methods are merged with default spy UI) */
  ui?: Partial<UIFacade>;

  /**
   * Sync platform mocks to global singleton for composables (useLLM, useCache, etc.)
   * @default true
   */
  syncSingleton?: boolean;
}

/**
 * Result of testCommand() — everything you need for assertions.
 */
export interface TestCommandResult<TResult = unknown> {
  /** Exit code from CommandResult (0 = success). Defaults to 0 if handler returns raw data. */
  exitCode: number;

  /** The result data from the handler */
  result: TResult | undefined;

  /** Custom metadata from CommandResult.meta */
  meta: Record<string, unknown> | undefined;

  /** The raw return value from handler.execute() — useful for non-CommandResult handlers */
  raw: unknown;

  /** UI facade with vi.fn() spies — assert on ui.success, ui.error, etc. */
  ui: UIFacade;

  /** The full context that was passed to the handler */
  ctx: PluginContextV3;

  /** Call in afterEach() to reset the global platform singleton */
  cleanup: () => void;
}

// ────────────────────────────────────────────────────────────────────
// Implementation
// ────────────────────────────────────────────────────────────────────

/**
 * Test a plugin command handler with minimal boilerplate.
 *
 * Creates a test context, builds the input object, calls handler.execute(),
 * and returns a result with UI spies for assertions.
 *
 * @example CLI command
 * ```typescript
 * import handler from '../src/commands/greet.js';
 *
 * const result = await testCommand(handler, {
 *   flags: { name: 'Alice' },
 * });
 * expect(result.exitCode).toBe(0);
 * expect(result.ui.success).toHaveBeenCalledWith('Hello, Alice!');
 * ```
 *
 * @example REST handler
 * ```typescript
 * import handler from '../src/routes/create-plan.js';
 *
 * const result = await testCommand(handler, {
 *   host: 'rest',
 *   body: { name: 'v2.0' },
 *   query: { workspace: 'root' },
 * });
 * expect(result.result).toMatchObject({ name: 'v2.0' });
 * ```
 *
 * @example With LLM mock
 * ```typescript
 * import { testCommand, mockLLM } from '@kb-labs/shared-testing';
 * import handler from '../src/commands/analyze.js';
 *
 * const llm = mockLLM().onAnyComplete().respondWith('looks good');
 * const result = await testCommand(handler, {
 *   flags: { file: 'index.ts' },
 *   platform: { llm },
 * });
 * expect(llm.complete).toHaveBeenCalled();
 * expect(result.exitCode).toBe(0);
 * ```
 */
export async function testCommand<TResult = unknown, TConfig = unknown>(
  handler: TestableHandler<TConfig, any, any>,
  options: TestCommandOptions<TConfig> = {}
): Promise<TestCommandResult<TResult>> {
  const {
    flags,
    argv = [],
    query,
    body,
    params,
    input: rawInput,
    host = 'cli',
    config,
    cwd,
    tenantId,
    signal,
    platform,
    ui,
    syncSingleton = true,
  } = options;

  // ── Build context ──────────────────────────────────────────────

  const ctxOptions: CreateTestContextOptions = {
    host,
    config,
    cwd,
    tenantId,
    signal,
    platform,
    ui,
    syncSingleton,
  };

  const { ctx, cleanup } = createTestContext<TConfig>(ctxOptions);

  // ── Build input ────────────────────────────────────────────────

  let input: unknown;

  if (rawInput !== undefined) {
    // Explicit raw input takes precedence
    input = rawInput;
  } else if (host === 'rest') {
    // REST handlers expect { query?, body?, params? }
    input = {
      ...(query !== undefined ? { query } : {}),
      ...(body !== undefined ? { body } : {}),
      ...(params !== undefined ? { params } : {}),
    };
  } else {
    // CLI/workflow handlers expect { flags, argv }
    input = { flags: flags ?? {}, argv };
  }

  // ── Execute ────────────────────────────────────────────────────

  let raw: unknown;
  try {
    raw = await handler.execute(ctx as PluginContextV3<TConfig>, input as any);
  } finally {
    // Call cleanup if handler has one
    await handler.cleanup?.();
  }

  // ── Normalize result ───────────────────────────────────────────

  // Handler may return CommandResult<T>, void, or raw data.
  // Detect by checking for exitCode property.
  let exitCode = 0;
  let result: TResult | undefined;
  let meta: Record<string, unknown> | undefined;

  if (raw != null && typeof raw === 'object' && 'exitCode' in raw) {
    // CommandResult shape
    const cmdResult = raw as CommandResult<TResult>;
    exitCode = cmdResult.exitCode;
    result = cmdResult.result;
    meta = cmdResult.meta;
  } else if (raw === undefined || raw === null) {
    // void return (RouteHandler can return void)
    exitCode = 0;
    result = undefined;
    meta = undefined;
  } else {
    // Raw data (Handler from defineHandler returns data directly)
    exitCode = 0;
    result = raw as TResult;
    meta = undefined;
  }

  return {
    exitCode,
    result,
    meta,
    raw,
    ui: ctx.ui,
    ctx: ctx as PluginContextV3,
    cleanup,
  };
}
