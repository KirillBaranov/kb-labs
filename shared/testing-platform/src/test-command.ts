/**
 * @module @kb-labs/shared-testing-platform/test-command
 *
 * Single-function test runner for plugin command handlers.
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

export interface TestableHandler<TConfig = unknown, TInput = unknown, TResult = unknown> {
  execute(
    context: PluginContextV3<TConfig>,
    input: TInput
  ): Promise<TResult> | TResult;
  cleanup?(): Promise<void> | void;
}

export interface TestCommandOptions<TConfig = unknown> {
  flags?: Record<string, unknown>;
  argv?: string[];
  query?: Record<string, unknown>;
  body?: unknown;
  params?: Record<string, unknown>;
  input?: unknown;
  host?: 'cli' | 'rest' | 'workflow' | 'webhook';
  config?: TConfig;
  cwd?: string;
  tenantId?: string;
  signal?: AbortSignal;
  platform?: Partial<PlatformServices>;
  ui?: Partial<UIFacade>;
  syncSingleton?: boolean;
}

export interface TestCommandResult<TResult = unknown> {
  exitCode: number;
  result: TResult | undefined;
  meta: Record<string, unknown> | undefined;
  raw: unknown;
  ui: UIFacade;
  ctx: PluginContextV3;
  cleanup: () => void;
}

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

  let input: unknown;

  if (rawInput !== undefined) {
    input = rawInput;
  } else if (host === 'rest') {
    input = {
      ...(query !== undefined ? { query } : {}),
      ...(body !== undefined ? { body } : {}),
      ...(params !== undefined ? { params } : {}),
    };
  } else {
    input = { flags: flags ?? {}, argv };
  }

  let raw: unknown;
  try {
    raw = await handler.execute(ctx as PluginContextV3<TConfig>, input);
  } finally {
    await handler.cleanup?.();
  }

  let exitCode = 0;
  let result: TResult | undefined;
  let meta: Record<string, unknown> | undefined;

  if (raw != null && typeof raw === 'object' && 'exitCode' in raw) {
    const cmdResult = raw as CommandResult<TResult>;
    exitCode = cmdResult.exitCode;
    result = cmdResult.result;
    meta = cmdResult.meta;
  } else if (raw === undefined || raw === null) {
    exitCode = 0;
    result = undefined;
    meta = undefined;
  } else {
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
