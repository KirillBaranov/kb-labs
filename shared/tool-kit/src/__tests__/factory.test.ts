import { describe, it, expect, vi } from 'vitest';
import { createTool } from '../factory.js';

interface TestCtx {
  workingDir: string;
  verbose?: boolean;
}

const spec = {
  name: 'test_tool',
  description: 'A test tool',
  parameters: {
    type: 'object' as const,
    properties: {
      value: { type: 'string', description: 'A string value' },
    },
    required: ['value'],
  },
  execute: async ({ value }: { value: string }, ctx: TestCtx) => ({
    success: true,
    output: `${value} from ${ctx.workingDir}`,
  }),
};

describe('createTool', () => {
  it('returns a factory function', () => {
    const factory = createTool(spec);
    expect(typeof factory).toBe('function');
  });

  it('factory returns tool with correct definition', () => {
    const factory = createTool(spec);
    const tool = factory({ workingDir: '/project' });

    expect(tool.definition.type).toBe('function');
    expect(tool.definition.function.name).toBe('test_tool');
    expect(tool.definition.function.description).toBe('A test tool');
    expect(tool.definition.function.parameters.required).toContain('value');
  });

  it('tool executor calls spec.execute with input and context', async () => {
    const execute = vi.fn(async () => ({ success: true, output: 'ok' }));
    const factory = createTool({ ...spec, execute });

    const ctx: TestCtx = { workingDir: '/my/project' };
    const tool = factory(ctx);
    await tool.executor({ value: 'hello' });

    expect(execute).toHaveBeenCalledWith({ value: 'hello' }, ctx);
  });

  it('executor returns result from spec.execute', async () => {
    const factory = createTool(spec);
    const tool = factory({ workingDir: '/root' });

    const result = await tool.executor({ value: 'test' }) as any;

    expect(result.success).toBe(true);
    expect(result.output).toBe('test from /root');
  });

  it('each factory call creates independent tool bound to its context', async () => {
    const execute = vi.fn(async (_input: unknown, ctx: TestCtx) => ({
      success: true,
      output: ctx.workingDir,
    }));
    const factory = createTool({ ...spec, execute });

    const tool1 = factory({ workingDir: '/dir1' });
    const tool2 = factory({ workingDir: '/dir2' });

    const r1 = await tool1.executor({}) as any;
    const r2 = await tool2.executor({}) as any;

    expect(r1.output).toBe('/dir1');
    expect(r2.output).toBe('/dir2');
  });

  it('parameters shape is preserved verbatim', () => {
    const customParams = {
      type: 'object' as const,
      properties: {
        foo: { type: 'number' },
        bar: { type: 'boolean' },
      },
      required: ['foo'],
    };
    const factory = createTool({ ...spec, parameters: customParams });
    const tool = factory({ workingDir: '/' });

    expect(tool.definition.function.parameters).toEqual(customParams);
  });

  it('executor propagates errors from spec.execute', async () => {
    const factory = createTool({
      ...spec,
      execute: async () => { throw new Error('something went wrong'); },
    });
    const tool = factory({ workingDir: '/' });

    await expect(tool.executor({})).rejects.toThrow('something went wrong');
  });
});
