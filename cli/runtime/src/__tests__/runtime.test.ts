import { describe, it, expect, vi } from 'vitest';
import { createCliRuntime, type RuntimeSetupOptions } from '../runtime.js';
import type { Presenter } from '@kb-labs/cli-contracts';
import type { Output } from '@kb-labs/core-sys/output';

function createMinimalOptions(): RuntimeSetupOptions {
  const presenter: Presenter = {
    write: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    json: vi.fn(),
    isTTY: false,
    isQuiet: false,
    isJSON: false,
  };
  const output = {
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

  return { presenter, output };
}

describe('createCliRuntime', () => {
  it('returns runtime with context, middleware, and formatters', async () => {
    const runtime = await createCliRuntime(createMinimalOptions());

    expect(runtime.context).toBeDefined();
    expect(runtime.context.requestId).toBeDefined();
    expect(runtime.middleware).toBeDefined();
    expect(runtime.formatters).toBeDefined();
  });

  it('registers default formatters (json, yaml, table, markdown)', async () => {
    const runtime = await createCliRuntime(createMinimalOptions());

    expect(runtime.formatters.get('json')).toBeDefined();
    expect(runtime.formatters.get('yaml')).toBeDefined();
    expect(runtime.formatters.get('table')).toBeDefined();
    expect(runtime.formatters.get('markdown')).toBeDefined();
  });

  it('registerMiddleware adds to the chain', async () => {
    const runtime = await createCliRuntime(createMinimalOptions());
    const order: string[] = [];

    runtime.registerMiddleware({
      name: 'test',
      priority: 1,
      middleware: async (_ctx, next) => { order.push('mw'); return next(); },
    });

    await runtime.middleware.execute({}, async () => { order.push('handler'); return 'ok'; });
    expect(order).toEqual(['mw', 'handler']);
  });

  it('registerFormatter adds custom formatter', async () => {
    const runtime = await createCliRuntime(createMinimalOptions());

    runtime.registerFormatter({ name: 'custom', format: () => 'custom-output' });
    expect(runtime.formatters.format({}, 'custom')).toBe('custom-output');
  });

  it('accepts pre-created context', async () => {
    const opts = createMinimalOptions();
    const preCtx = {
      requestId: 'pre-123',
      cwd: '/tmp',
      repoRoot: '/tmp',
      env: process.env,
      presenter: opts.presenter,
      output: opts.output,
      verbosity: 'normal' as const,
      jsonMode: false,
    };

    const runtime = await createCliRuntime({ ...opts, context: preCtx });
    expect(runtime.context.requestId).toBe('pre-123');
  });

  it('accepts initial middlewares via options', async () => {
    const order: string[] = [];
    const runtime = await createCliRuntime({
      ...createMinimalOptions(),
      middlewares: [
        {
          name: 'init-mw',
          priority: 1,
          middleware: async (_ctx, next) => { order.push('init'); return next(); },
        },
      ],
    });

    await runtime.middleware.execute({}, async () => { order.push('handler'); return 'ok'; });
    expect(order).toEqual(['init', 'handler']);
  });

  it('accepts initial formatters via options', async () => {
    const runtime = await createCliRuntime({
      ...createMinimalOptions(),
      formatters: [{ name: 'extra', format: () => 'extra' }],
    });

    expect(runtime.formatters.get('extra')).toBeDefined();
    // Default formatters still present
    expect(runtime.formatters.get('json')).toBeDefined();
  });
});
