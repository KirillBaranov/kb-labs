import { describe, it, expect } from 'vitest';
import { serializeContext } from '../runner/ipc-serializer.js';
import type { ExecutionContext } from '../types/index.js';

function createMinimalContext(overrides: Partial<ExecutionContext> = {}): ExecutionContext {
  return {
    requestId: 'req-123',
    workdir: '/workspace',
    pluginRoot: '/plugins/test',
    ...overrides,
  } as ExecutionContext;
}

describe('serializeContext', () => {
  it('serializes minimal context', () => {
    const ctx = createMinimalContext();
    const result = serializeContext(ctx);

    expect(result.requestId).toBe('req-123');
    expect(result.workdir).toBe('/workspace');
    expect(result.pluginRoot).toBe('/plugins/test');
  });

  it('preserves optional fields when present', () => {
    const ctx = createMinimalContext({
      outdir: '/output',
      pluginId: '@kb-labs/test',
      pluginVersion: '1.0.0',
      configSection: 'testPlugin',
      traceId: 'trace-1',
      spanId: 'span-1',
      parentSpanId: 'parent-1',
      debug: true,
      debugLevel: 'verbose',
      dryRun: true,
      user: { id: 'user-1' },
    });

    const result = serializeContext(ctx);

    expect(result.outdir).toBe('/output');
    expect(result.pluginId).toBe('@kb-labs/test');
    expect(result.pluginVersion).toBe('1.0.0');
    expect(result.configSection).toBe('testPlugin');
    expect(result.traceId).toBe('trace-1');
    expect(result.debug).toBe(true);
    expect(result.debugLevel).toBe('verbose');
    expect(result.dryRun).toBe(true);
    expect(result.user).toEqual({ id: 'user-1' });
  });

  it('throws on undefined context', () => {
    expect(() => serializeContext(undefined as any)).toThrow('Cannot serialize undefined context');
  });

  it('serializes adapter metadata when present', () => {
    const ctx = createMinimalContext({
      adapterMeta: {
        type: 'cli',
        handler: 'test-handler',
      } as any,
    });

    const result = serializeContext(ctx);
    expect(result.adapterMeta).toBeDefined();
    expect((result.adapterMeta as any).type).toBe('cli');
  });

  it('serializes CLI adapter context data', () => {
    const ctx = createMinimalContext({
      adapterContext: {
        type: 'cli',
        cwd: '/home/user',
        flags: { verbose: true },
        argv: ['run', '--fast'],
      } as any,
    });

    const result = serializeContext(ctx);
    expect(result.adapterContextData).toBeDefined();
    expect(result.adapterContextData!.type).toBe('cli');
    expect(result.adapterContextData!.cwd).toBe('/home/user');
    expect(result.adapterContextData!.flags).toEqual({ verbose: true });
    expect(result.adapterContextData!.argv).toEqual(['run', '--fast']);
  });

  it('skips large extensions (>100KB)', () => {
    const ctx = createMinimalContext({
      debug: true,
      extensions: { smallData: 'hello', largeData: 'x'.repeat(200_000) } as any,
    });

    const result = serializeContext(ctx);
    expect(result.extensionsData?.smallData).toBe('hello');
    expect(result.extensionsData?.largeData).toBeUndefined();
  });

  it('skips function extensions', () => {
    const ctx = createMinimalContext({
      extensions: { callback: () => {}, data: 'kept' } as any,
    });

    const result = serializeContext(ctx);
    expect(result.extensionsData?.callback).toBeUndefined();
    expect(result.extensionsData?.data).toBe('kept');
  });

  it('omits extensionsData when no serializable extensions', () => {
    const ctx = createMinimalContext({
      extensions: { fn: () => {} } as any,
    });

    const result = serializeContext(ctx);
    expect(result.extensionsData).toBeUndefined();
  });

  it('includes platformConfig when present', () => {
    const ctx = createMinimalContext({
      platformConfig: { mode: 'in-process' },
    });

    const result = serializeContext(ctx);
    expect(result.platformConfig).toEqual({ mode: 'in-process' });
  });
});
