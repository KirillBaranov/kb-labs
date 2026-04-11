/**
 * Integration test: full CLI runtime pipeline
 *
 * Tests the real flow: createCliRuntime → middleware chain → handler → result
 * No mocking of runtime internals — uses real MiddlewareManager, FormattersRegistry, etc.
 */
import { describe, it, expect, vi } from 'vitest';
import { createCliRuntime } from '../runtime.js';
import type { Presenter } from '@kb-labs/cli-contracts';
import type { Output } from '@kb-labs/core-sys/output';

function createTestPresenter(): Presenter & { written: string[]; errors: string[] } {
  const written: string[] = [];
  const errors: string[] = [];
  return {
    write: vi.fn((msg: string) => { written.push(msg); }),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn((msg: string) => { errors.push(msg); }),
    json: vi.fn(),
    isTTY: false,
    isQuiet: false,
    isJSON: false,
    written,
    errors,
  };
}

function createTestOutput(): Output {
  return {
    write: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    success: vi.fn(),
    json: vi.fn(),
    table: vi.fn(),
    progress: vi.fn(),
    spinner: vi.fn(),
  } as unknown as Output;
}

describe('CLI Runtime Pipeline Integration', () => {
  it('executes handler through empty middleware chain', async () => {
    const presenter = createTestPresenter();
    const runtime = await createCliRuntime({
      presenter,
      output: createTestOutput(),
    });

    const result = await runtime.middleware.execute(
      runtime.context,
      async () => {
        presenter.write('handler executed');
        return 0;
      },
    );

    expect(result).toBe(0);
    expect(presenter.written).toContain('handler executed');
  });

  it('executes handler through middleware chain with logging', async () => {
    const log: string[] = [];
    const presenter = createTestPresenter();

    const runtime = await createCliRuntime({
      presenter,
      output: createTestOutput(),
      middlewares: [
        {
          name: 'audit',
          priority: 10,
          middleware: async (_ctx, next) => {
            log.push('audit:before');
            const result = await next();
            log.push('audit:after');
            return result;
          },
        },
        {
          name: 'timing',
          priority: 20,
          middleware: async (_ctx, next) => {
            const start = Date.now();
            log.push('timing:start');
            const result = await next();
            log.push(`timing:done`);
            return result;
          },
        },
      ],
    });

    const result = await runtime.middleware.execute(
      runtime.context,
      async () => {
        log.push('handler');
        return 0;
      },
    );

    expect(result).toBe(0);
    expect(log).toEqual([
      'audit:before',
      'timing:start',
      'handler',
      'timing:done',
      'audit:after',
    ]);
  });

  it('middleware can intercept errors and return fallback exit code', async () => {
    const presenter = createTestPresenter();

    const runtime = await createCliRuntime({
      presenter,
      output: createTestOutput(),
      middlewares: [
        {
          name: 'error-guard',
          priority: 1,
          middleware: async (_ctx, next) => {
            try {
              return await next();
            } catch (err) {
              presenter.error((err as Error).message);
              return 1;
            }
          },
        },
      ],
    });

    const result = await runtime.middleware.execute(
      runtime.context,
      async () => { throw new Error('command failed'); },
    );

    expect(result).toBe(1);
    expect(presenter.errors).toContain('command failed');
  });

  it('formatter registry works end-to-end with runtime', async () => {
    const presenter = createTestPresenter();
    const runtime = await createCliRuntime({
      presenter,
      output: createTestOutput(),
    });

    // JSON formatter should be pre-registered
    const json = runtime.formatters.format({ status: 'ok', count: 42 }, 'json');
    expect(JSON.parse(json)).toEqual({ status: 'ok', count: 42 });

    // YAML formatter should be pre-registered
    const yaml = runtime.formatters.format({ name: 'test' }, 'yaml');
    expect(yaml).toContain('name: test');
  });

  it('context has request ID and cwd', async () => {
    const presenter = createTestPresenter();
    const runtime = await createCliRuntime({
      presenter,
      output: createTestOutput(),
    });

    expect(runtime.context.requestId).toBeDefined();
    expect(runtime.context.requestId.length).toBeGreaterThan(0);
    expect(runtime.context.cwd).toBeDefined();
  });

  it('dynamically registered middleware participates in pipeline', async () => {
    const presenter = createTestPresenter();
    const runtime = await createCliRuntime({
      presenter,
      output: createTestOutput(),
    });

    const intercepted: boolean[] = [];

    runtime.registerMiddleware({
      name: 'late-addition',
      priority: 1,
      middleware: async (_ctx, next) => {
        intercepted.push(true);
        return next();
      },
    });

    await runtime.middleware.execute(runtime.context, async () => 0);

    expect(intercepted).toHaveLength(1);
  });

  it('dynamically registered formatter is available', async () => {
    const presenter = createTestPresenter();
    const runtime = await createCliRuntime({
      presenter,
      output: createTestOutput(),
    });

    runtime.registerFormatter({
      name: 'csv',
      format: (data: unknown) => {
        const arr = data as string[][];
        return arr.map(row => row.join(',')).join('\n');
      },
    });

    const result = runtime.formatters.format([['a', 'b'], ['1', '2']], 'csv');
    expect(result).toBe('a,b\n1,2');
  });
});
