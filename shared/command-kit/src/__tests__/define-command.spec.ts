import { describe, it, expect, vi, beforeEach } from 'vitest';
import { defineCommand } from '../index';

describe('defineCommand', () => {
  let mockCtx: any; // PluginContextV3
  let mockUI: {
    write: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
    success: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };
  let mockLogger: {
    info: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockUI = {
      write: vi.fn(),
      json: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      success: vi.fn(),
      warn: vi.fn(),
    };

    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
    };

    // PluginContextV3 structure
    mockCtx = {
      host: 'cli',
      requestId: 'test-request-id',
      pluginId: '@kb-labs/test',
      cwd: '/test',
      ui: mockUI,
      platform: {
        logger: mockLogger as unknown as any,
        llm: {} as any,
        embeddings: {} as any,
        vectorStore: {} as any,
        cache: {} as any,
        storage: {} as any,
        analytics: {} as any,
      },
      runtime: {
        fs: {} as any,
        fetch: vi.fn(),
        env: vi.fn(),
      } as any,
      api: {} as any,
      trace: {
        traceId: 'test-trace-id',
        spanId: 'test-span-id',
      },
    };
  });

  it('should call handler with correct input (V3 API)', async () => {
    const handler = vi.fn().mockResolvedValue({ ok: true, result: 'success' });

    const command = defineCommand({
      id: 'test:command',
      description: 'Test command',
      handler: {
        execute: handler,
      },
    });

    const result = await command.execute(mockCtx, { flags: { name: 'test' }, argv: [] });

    expect(result.ok).toBe(true);
    expect(result.ok).toBe(true);
    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0]?.[0]).toBe(mockCtx);
    expect(handler.mock.calls[0]?.[1]).toEqual({ flags: { name: 'test' }, argv: [] });
  });

  it('should enforce CLI host restriction', async () => {
    const handler = vi.fn();

    const command = defineCommand({
      id: 'test:command',
      description: 'Test command',
      handler: {
        execute: handler,
      },
    });

    // Change host to REST
    mockCtx.host = 'rest';

    try {
      await command.execute(mockCtx, { flags: {}, argv: [] });
      expect.fail('Should have thrown an error');
    } catch (error: any) {
      expect(error.message).toContain('can only run in CLI or workflow host');
    }

    expect(handler).not.toHaveBeenCalled();
  });

  it('should allow workflow host', async () => {
    const handler = vi.fn().mockResolvedValue({ ok: true });

    const command = defineCommand({
      id: 'test:command',
      description: 'Test command',
      handler: {
        execute: handler,
      },
    });

    // Change host to workflow
    mockCtx.host = 'workflow';

    const result = await command.execute(mockCtx, { flags: {}, argv: [] });

    expect(result.ok).toBe(true);
    expect(handler).toHaveBeenCalledOnce();
  });

  it('should handle handler returning number', async () => {
    const handler = vi.fn().mockResolvedValue({ ok: true });

    const command = defineCommand({
      id: 'test:command',
      description: 'Test command',
      handler: {
        execute: handler,
      },
    });

    const result = await command.execute(mockCtx, { flags: {}, argv: [] });

    expect(result.ok).toBe(true);
  });

  it('should handle handler returning object with ok', async () => {
    const handler = vi.fn().mockResolvedValue({ ok: true, result: 'test' });

    const command = defineCommand({
      id: 'test:command',
      description: 'Test command',
      handler: {
        execute: handler,
      },
    });

    const result = await command.execute(mockCtx, { flags: {}, argv: [] });

    expect(result.ok).toBe(true);
  });

  it('should handle errors in handler', async () => {
    const handler = vi.fn().mockRejectedValue(new Error('Handler error'));

    const command = defineCommand({
      id: 'test:command',
      description: 'Test command',
      handler: {
        execute: handler,
      },
    });

    await expect(
      command.execute(mockCtx, { flags: {}, argv: [] })
    ).rejects.toThrow('Handler error');
  });

  it('should call cleanup if provided', async () => {
    const handler = vi.fn().mockResolvedValue({ ok: true });
    const cleanup = vi.fn().mockResolvedValue(undefined);

    const command = defineCommand({
      id: 'test:command',
      description: 'Test command',
      handler: {
        execute: handler,
        cleanup,
      },
    });

    await command.execute(mockCtx, { flags: {}, argv: [] });

    // Cleanup should be available
    expect(command.cleanup).toBe(cleanup);

    // Call cleanup manually
    await command.cleanup!();
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it('should handle handler returning a failure result', async () => {
    const handler = vi.fn().mockResolvedValue({ ok: false, error: 'failed' });

    const command = defineCommand({
      id: 'test:command',
      description: 'Test command',
      handler: {
        execute: handler,
      },
    });

    const result = await command.execute(mockCtx, { flags: {}, argv: [] });

    expect(result.ok).toBe(false);
  });

  it('should handle handler returning object with ok: false', async () => {
    const handler = vi.fn().mockResolvedValue({ ok: false, error: 'failed' });

    const command = defineCommand({
      id: 'test:command',
      description: 'Test command',
      handler: {
        execute: handler,
      },
    });

    const result = await command.execute(mockCtx, { flags: {}, argv: [] });

    expect(result.ok).toBe(false);
  });

  it('should pass through custom result fields', async () => {
    const handler = vi.fn().mockResolvedValue({
      ok: true,
      result: { customField: 'custom-value', nested: 'data' },
    });

    const command = defineCommand({
      id: 'test:command',
      description: 'Test command',
      handler: {
        execute: handler,
      },
    });

    const result = await command.execute(mockCtx, { flags: {}, argv: [] }) as any;

    expect(result.ok).toBe(true);
    expect(result.result).toEqual({ customField: 'custom-value', nested: 'data' });
  });

  it('should work with async handlers', async () => {
    const handler = vi.fn(async () => {
      await new Promise<void>(resolve => { setTimeout(resolve, 10); });
      return { ok: true };
    });

    const command = defineCommand({
      id: 'test:command',
      description: 'Test command',
      handler: {
        execute: handler,
      },
    });

    const result = await command.execute(mockCtx, { flags: {}, argv: [] });

    expect(result.ok).toBe(true);
  });

  it('should work with sync handlers', async () => {
    const handler = vi.fn(() => ({ ok: true }));

    const command = defineCommand({
      id: 'test:command',
      description: 'Test command',
      handler: {
        execute: handler,
      },
    });

    const result = await command.execute(mockCtx, { flags: {}, argv: [] });

    expect(result.ok).toBe(true);
  });
});

describe('defineCommand — dry-run routing', () => {
  let mockCtx: any;

  beforeEach(() => {
    mockCtx = {
      host: 'cli',
      requestId: 'req-1',
      pluginId: '@kb-labs/test',
      cwd: '/test',
      ui: {
        info: vi.fn(),
        success: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        json: vi.fn(),
        write: vi.fn(),
      },
      platform: { logger: { info: vi.fn(), error: vi.fn() } },
      runtime: { fs: {}, fetch: vi.fn(), env: vi.fn() },
      api: {},
      trace: { traceId: 't1', spanId: 's1' },
    };
  });

  it('calls intent() when dry-run flag is true and intent is defined', async () => {
    const intent = vi.fn().mockResolvedValue({
      summary: 'Delete task abc',
      operations: [{ type: 'delete', resource: 'task', details: { taskId: 'abc' } }],
    });
    const execute = vi.fn();

    const command = defineCommand({
      id: 'test:dry',
      handler: { intent, execute },
    });

    const result = await command.execute(mockCtx, { flags: { 'dry-run': true }, argv: ['abc'] });

    expect(intent).toHaveBeenCalledOnce();
    expect(execute).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
    expect(mockCtx.ui.info).toHaveBeenCalledWith(
      expect.stringContaining('Dry-run: Delete task abc'),
      expect.objectContaining({ sections: expect.any(Array) }),
    );
  });

  it('calls execute() when dry-run is false', async () => {
    const intent = vi.fn();
    const execute = vi.fn().mockResolvedValue({ ok: true });

    const command = defineCommand({
      id: 'test:dry',
      handler: { intent, execute },
    });

    await command.execute(mockCtx, { flags: { 'dry-run': false }, argv: [] });

    expect(execute).toHaveBeenCalledOnce();
    expect(intent).not.toHaveBeenCalled();
  });

  it('calls execute() when dry-run is true but intent is not defined', async () => {
    const execute = vi.fn().mockResolvedValue({ ok: true });

    const command = defineCommand({
      id: 'test:no-intent',
      handler: { execute },
    });

    await command.execute(mockCtx, { flags: { 'dry-run': true }, argv: [] });

    expect(execute).toHaveBeenCalledOnce();
  });

  it('renders MutateIntent with operations list', async () => {
    const command = defineCommand({
      id: 'test:mutate',
      handler: {
        intent: async () => ({
          summary: 'Create task X',
          operations: [{ type: 'create', resource: 'task', details: { name: 'X' } }],
        }),
        execute: vi.fn(),
      },
    });

    await command.execute(mockCtx, { flags: { 'dry-run': true }, argv: [] });

    const [msg, opts] = mockCtx.ui.info.mock.calls[0];
    expect(msg).toBe('Dry-run: Create task X');
    expect(opts.sections[0].items[0]).toContain('CREATE task');
  });

  it('renders ExecuteIntent without operations (no sections)', async () => {
    const command = defineCommand({
      id: 'test:execute',
      handler: {
        intent: async () => ({
          summary: 'Run workflow build',
          estimatedDurationMs: 5000,
        }),
        execute: vi.fn(),
      },
    });

    await command.execute(mockCtx, { flags: { 'dry-run': true }, argv: [] });

    const [msg] = mockCtx.ui.info.mock.calls[0];
    expect(msg).toContain('Dry-run: Run workflow build');
    expect(msg).toContain('~5s');
  });
});
